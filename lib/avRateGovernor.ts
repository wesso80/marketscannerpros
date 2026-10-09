import { pausedAdminAvRequest } from './admin/adminEquities';
/**
 * Global Alpha Vantage Rate Governor
 * 
 * Centralised rate limiter shared across ALL AV consumers:
 * - API routes (scanner, flow, options, deep-analysis, etc.)
 * - On-demand fetcher
 * - Background worker (when deployed alongside)
 * 
 * The shared Redis ceiling is 300/min (lib/avLimiter.ts). Untagged calls use the
 * scheduled lane. ALPHA_VANTAGE_RPM no longer grants a separate budget.
 * A full minute does not fall through to a second in-memory bucket.
 *
 * Every AV call should go through `avFetch()` or `avTakeToken()`.
 */

import { avCircuit, CircuitBreakerOpenError } from './circuitBreaker';
import { AV_CEILING_PER_MIN, avTakeToken as takeSharedToken, avTryTake, currentAvBudget, type AvBudget } from './avLimiter';

export type { AvBudget };

/**
 * Take a token from the shared limiter.
 * Pass a lane and feature, or call inside runWithAvBudget.
 * Untagged callers are the scheduled lane so a cron that forgot a tag does not spend the user reserve.
 */
export async function avTakeToken(budget?: Partial<AvBudget>): Promise<void> {
  await takeSharedToken(budget);
}

/** Non-blocking shared take. False means the ceiling or a higher lane's reserve is full. */
export async function avTryToken(budget?: Partial<AvBudget>): Promise<boolean> {
  return avTryTake(budget);
}

/**
 * Rate-governed fetch wrapper for Alpha Vantage.
 * Waits for a token, then performs the fetch and returns the JSON.
 * 
 * @param url       Full AV URL (including apikey)
 * @param label     Short descriptive label for logging (e.g. "GLOBAL_QUOTE AAPL")
 * @param options   Optional fetch init (headers, signal, etc.)
 */
export async function avFetch<T = any>(
  url: string,
  label?: string,
  options?: RequestInit,
): Promise<T | null> {
  // Wait for rate-limit slot
  await avTakeToken();
  return _avFetchCore<T>(url, label, options);
}

/**
 * Admin AV fetch. It takes a shared token (the surrounding runWithAvBudget
 * lane, or scheduled when nobody set one). It does not skip the ceiling.
 * Do NOT call this from public/user-facing routes.
 */
export async function avFetchAdmin<T = any>(
  url: string,
  label?: string,
  options?: RequestInit,
): Promise<T | null> {
  if (pausedAdminAvRequest(url)) return null;
  const ctx = currentAvBudget();
  await avTakeToken(ctx ?? { lane: 'scheduled', feature: 'admin-av' });
  return _avFetchCore<T>(url, label, options);
}

async function _avFetchCore<T>(
  url: string,
  label?: string,
  options?: RequestInit,
): Promise<T | null> {
  const tag = label || url.match(/function=([A-Z_]+)/)?.[1] || 'AV';

  try {
    // Wrap in circuit breaker — hard failures (HTTP 5xx, timeouts, network)
    // will count toward tripping the breaker.
    const res = await avCircuit.call(() => fetch(url, {
      signal: AbortSignal.timeout(20_000),
      ...options,
    }));

    if (!res.ok) {
      console.warn(`[avRateGovernor] ${tag} HTTP ${res.status}`);
      // 404 = no data for symbol — return null (not an error)
      if (res.status === 404) return null;
      // All other HTTP errors: throw so callers & circuit breaker can react
      throw new Error(`AV HTTP ${res.status} for ${tag}`);
    }

    const json = (await res.json()) as T & {
      Note?: string;
      'Error Message'?: string;
      Information?: string;
    };

    // AV returns 200 even on quota/error — detect these
    if (json.Note) {
      // Quota exhaustion — throw so callers know the API is unavailable
      console.warn(`[avRateGovernor] ${tag} QUOTA NOTE: ${json.Note}`);
      throw new Error(`AV quota exceeded: ${json.Note}`);
    }
    if (json['Error Message']) {
      // Invalid symbol / bad params — genuine "no data", return null
      console.warn(`[avRateGovernor] ${tag} ERROR: ${json['Error Message']}`);
      return null;
    }
    if (json.Information) {
      // Informational (often quota-related) — throw
      console.warn(`[avRateGovernor] ${tag} INFO: ${json.Information}`);
      throw new Error(`AV info error: ${json.Information}`);
    }

    return json;
  } catch (err: unknown) {
    if (err instanceof CircuitBreakerOpenError) {
      console.warn(`[avRateGovernor] ${tag} circuit breaker OPEN — skipping request (retry in ${Math.round(err.retryAfterMs / 1000)}s)`);
      throw new Error(`AV circuit breaker open for ${tag} (retry in ${Math.round(err.retryAfterMs / 1000)}s)`);
    }
    const e = err as { name?: string; message?: string };
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
      console.warn(`[avRateGovernor] ${tag} timed out`);
      throw new Error(`AV request timed out for ${tag}`);
    }
    // Re-throw all other errors (including the ones we threw above)
    throw err;
  }
}

/**
 * How many tokens are currently available (for diagnostics).
 * Checks Redis first; falls back to in-memory estimate.
 */
export async function avAvailable(): Promise<number> {
  const { getRedis } = await import('./redis');
  const redis = getRedis();
  if (redis) {
    try {
      const now = Date.now();
      await redis.zremrangebyscore('av_limiter:minute', 0, now - 60_000);
      const used = await redis.zcard('av_limiter:minute');
      return Math.max(0, AV_CEILING_PER_MIN - (used ?? 0));
    } catch { /* diagnostic only */ }
  }
  return 0;
}

export async function getAlphaVantageProviderStatus() {
  return {
    provider: 'alpha_vantage',
    configuredRpm: AV_CEILING_PER_MIN,
    availableNow: await avAvailable(),
    hasApiKey: Boolean(process.env.ALPHA_VANTAGE_API_KEY),
    liveOutputSize: process.env.OPERATOR_AV_OUTPUTSIZE === 'full' ? 'full' : 'compact',
    realtimeEntitlementRequested: true,
  };
}
