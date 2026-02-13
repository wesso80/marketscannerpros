/**
 * Cache Mode Feature Flag
 * 
 * Controls how the app fetches market data:
 * - 'legacy': Use old direct AV calls (current production behavior)  
 * - 'prefer_cache': Try cache first, fallback to AV if missing
 * - 'cache_only': Only use cache, never call AV (after worker is stable)
 * 
 * Set via CACHE_MODE env var. Default is 'legacy' for safety.
 */

export type CacheMode = 'legacy' | 'prefer_cache' | 'cache_only';

export function getCacheMode(): CacheMode {
  const mode = process.env.CACHE_MODE?.toLowerCase();
  
  if (mode === 'prefer_cache' || mode === 'prefer-cache') return 'prefer_cache';
  if (mode === 'cache_only' || mode === 'cache-only') return 'cache_only';
  
  // Default to legacy (no behavior change until explicitly enabled)
  return 'legacy';
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
