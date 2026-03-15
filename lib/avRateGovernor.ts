/**
 * Global Alpha Vantage Rate Governor
 * 
 * Centralised rate limiter shared across ALL AV consumers:
 * - API routes (scanner, flow, options, deep-analysis, etc.)
 * - On-demand fetcher
 * - Background worker (when deployed alongside)
 * 
 * Configured via ALPHA_VANTAGE_RPM env var (default: 400; contract allows 600 RPM, uncapped monthly).
 * Budget split: web=400 RPM (this governor), worker=200 RPM (own TokenBucket in ingest-data.ts).
 * Total across web + worker must not exceed 600 RPM contract limit.
 * 
 * Uses Redis (Upstash) sliding-window counter so rate limits survive deploys
 * and coordinate across multiple server instances. Falls back to in-memory
 * TokenBucket when Redis is unavailable.
 * 
 * Every AV call in the codebase should go through `avFetch()` or `avTakeToken()`
 * to ensure we never exceed the global quota.
 */

import { TokenBucket } from './rateLimiter';
import { getRedis } from './redis';
import { avCircuit, CircuitBreakerOpenError } from './circuitBreaker';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const RPM = parseInt(process.env.ALPHA_VANTAGE_RPM || '400', 10);
const REDIS_KEY = 'av_rate:minute';

// ---------------------------------------------------------------------------
// In-memory fallback (used when Redis is unavailable)
// ---------------------------------------------------------------------------

let memGovernor: TokenBucket | null = null;

function getMemGovernor(): TokenBucket {
  if (!memGovernor) {
    const burst = Math.min(RPM, 15);
    memGovernor = new TokenBucket(burst, RPM / 60);
    console.log(`[avRateGovernor] In-memory fallback: ${RPM} RPM, burst ${burst}`);
  }
  return memGovernor;
}

// ---------------------------------------------------------------------------
// Redis sliding-window helpers
// ---------------------------------------------------------------------------

/**
 * Try to take a token via Redis sliding-window counter.
 * Returns true if under limit, false if over. Returns null on Redis error.
 */
async function redisTryTake(): Promise<boolean | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const now = Date.now();
    const windowStart = now - 60_000;

    // Atomic pipeline: Remove expired entries, add new one, count total, set TTL
    const pipe = redis.pipeline();
    pipe.zremrangebyscore(REDIS_KEY, 0, windowStart);
    pipe.zadd(REDIS_KEY, { score: now, member: `${now}-${Math.random().toString(36).slice(2, 8)}` });
    pipe.zcard(REDIS_KEY);
    pipe.expire(REDIS_KEY, 65); // Auto-cleanup: slightly longer than 60s window

    const results = await pipe.exec();
    const count = results[2] as number;

    if (count > RPM) {
      // Over limit — remove the member we just added
      // (Best-effort; tiny race window is acceptable)
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[avRateGovernor] Redis error, falling back to in-memory:', (err as Error).message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Counters (for observability)
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
 * Take a token (blocking). Tries Redis first; falls back to in-memory.
 * Use this when you construct the URL yourself and just need rate-limit coordination.
 */
export async function avTakeToken(): Promise<void> {
  const redisResult = await redisTryTake();
  if (redisResult === true) {
    trackCall();
    return;
  }
  if (redisResult === false) {
    // Over limit — wait a short time then retry via in-memory fallback
    await new Promise(r => setTimeout(r, 200));
  }
  // Redis unavailable or over-limit: fall back to in-memory bucket
  await getMemGovernor().take(1);
  trackCall();
}

/**
 * Try to take a token without blocking.
 * Returns true if a token was available, false if quota is exhausted.
 */
export async function avTryToken(): Promise<boolean> {
  const redisResult = await redisTryTake();
  if (redisResult !== null) {
    if (redisResult) trackCall();
    return redisResult;
  }
  // Redis unavailable: fall back to in-memory
  const ok = getMemGovernor().tryTake(1);
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
  const redis = getRedis();
  if (redis) {
    try {
      const now = Date.now();
      await redis.zremrangebyscore(REDIS_KEY, 0, now - 60_000);
      const used = await redis.zcard(REDIS_KEY);
      return Math.max(0, RPM - (used ?? 0));
    } catch { /* fall through */ }
  }
  return getMemGovernor().available();
}
