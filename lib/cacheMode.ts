/**
 * Cache Mode Feature Flag
 * 
 * Controls how the app fetches market data:
 * - 'legacy': Use old direct AV calls (current production behavior)  
 * - 'prefer_cache': Try cache first, fallback to AV if missing
 * - 'cache_only': Only use cache, never call AV (after worker is stable)
 * 
 * Set via CACHE_MODE env var. Default is 'prefer_cache' (use worker data first).
 * Set to 'legacy' only if the worker is offline and you need direct AV calls.
 */

export type CacheMode = 'legacy' | 'prefer_cache' | 'cache_only';

export function getCacheMode(): CacheMode {
  const mode = process.env.CACHE_MODE?.toLowerCase();
  
  if (mode === 'legacy') return 'legacy';
  if (mode === 'cache_only' || mode === 'cache-only') return 'cache_only';
  
  // Default to prefer_cache — the worker pre-populates Redis/DB,
  // so we should use that data first and only call AV on cache miss.
  return 'prefer_cache';
}

/**
 * Check if we should try cache before AV
 */
export function shouldUseCache(): boolean {
  const mode = getCacheMode();
  return mode === 'prefer_cache' || mode === 'cache_only';
}

/**
 * Check if we're allowed to fallback to AV
 */
export function canFallbackToAV(): boolean {
  const mode = getCacheMode();
  return mode === 'legacy' || mode === 'prefer_cache';
}

/**
 * Log cache mode on startup (for debugging)
 */
export function logCacheMode(): void {
  const mode = getCacheMode();
  console.log(`[CacheMode] Running in '${mode}' mode`);
}
