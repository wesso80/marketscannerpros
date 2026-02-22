/**
 * Global Alpha Vantage Rate Governor
 * 
 * Centralised rate limiter shared across ALL AV consumers:
 * - API routes (scanner, flow, options, deep-analysis, etc.)
 * - On-demand fetcher
 * - Background worker (when deployed alongside)
 * 
 * Configured via ALPHA_VANTAGE_RPM env var (default: 600 for premium plan).
 * 
 * Every AV call in the codebase should go through `avFetch()` or `avTakeToken()`
 * to ensure we never exceed the global quota.
 */

import { TokenBucket } from './rateLimiter';

// ---------------------------------------------------------------------------
// Singleton rate governor
// ---------------------------------------------------------------------------

let governor: TokenBucket | null = null;

function getGovernor(): TokenBucket {
  if (!governor) {
    const rpm = parseInt(process.env.ALPHA_VANTAGE_RPM || '70', 10);
    // Burst capacity = min(rpm, 10) → avoids stampede at startup
    const burst = Math.min(rpm, 10);
    governor = new TokenBucket(burst, rpm / 60);
    console.log(`[avRateGovernor] Initialised: ${rpm} RPM, burst ${burst}`);
  }
  return governor;
}

// ---------------------------------------------------------------------------
// Counters (per-process, reset on deploy — for observability, not enforcement)
// ---------------------------------------------------------------------------

let callCountWindow = 0;
let windowStart = Date.now();

function trackCall(): void {
  const now = Date.now();
  if (now - windowStart >= 60_000) {
    if (callCountWindow > 0) {
      console.log(`[avRateGovernor] Last 60 s: ${callCountWindow} AV calls`);
    }
    callCountWindow = 0;
    windowStart = now;
  }
  callCountWindow++;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Take a token (blocking). Use this when you construct the URL yourself
 * and just need rate-limit coordination (e.g. inside the worker).
 */
export async function avTakeToken(): Promise<void> {
  await getGovernor().take(1);
  trackCall();
}

/**
 * Try to take a token without blocking.
 * Returns true if a token was available, false if quota is exhausted.
 */
export function avTryToken(): boolean {
  const ok = getGovernor().tryTake(1);
  if (ok) trackCall();
  return ok;
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

  const tag = label || url.match(/function=([A-Z_]+)/)?.[1] || 'AV';

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
      ...options,
    });

    if (!res.ok) {
      console.warn(`[avRateGovernor] ${tag} HTTP ${res.status}`);
      return null;
    }

    const json = (await res.json()) as T & {
      Note?: string;
      'Error Message'?: string;
      Information?: string;
    };

    // AV returns 200 even on quota/error — detect these
    if ((json as any)?.Note) {
      console.warn(`[avRateGovernor] ${tag} QUOTA NOTE: ${(json as any).Note}`);
      return null;
    }
    if ((json as any)?.['Error Message']) {
      console.warn(`[avRateGovernor] ${tag} ERROR: ${(json as any)['Error Message']}`);
      return null;
    }
    if ((json as any)?.Information) {
      console.warn(`[avRateGovernor] ${tag} INFO: ${(json as any).Information}`);
      return null;
    }

    return json;
  } catch (err: any) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      console.warn(`[avRateGovernor] ${tag} timed out`);
    } else {
      console.error(`[avRateGovernor] ${tag} fetch error:`, err?.message || err);
    }
    return null;
  }
}

/**
 * How many tokens are currently available (for diagnostics).
 */
export function avAvailable(): number {
  return getGovernor().available();
}
