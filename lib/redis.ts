/**
 * Redis client for MSP caching layer
 * Uses Upstash Redis for serverless-compatible caching
 * 
 * Pattern:
 * - Worker writes: symbol data, computed indicators, scanner results
 * - API reads: check cache first, fallback to Neon DB
 */

import { Redis } from '@upstash/redis';

// Singleton pattern for Redis client
let redis: Redis | null = null;
let redisDisabled = false;
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 5;

export function getRedis(): Redis | null {
  if (redisDisabled) return null;
  if (redis) return redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn('[redis] Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN - caching disabled');
    redisDisabled = true;
    return null;
  }

  redis = new Redis({ url, token });
  return redis;
}

/** Reset client after repeated failures so next call re-initialises */
function onRedisError(err: unknown) {
  consecutiveErrors++;
  console.error(`[redis] Error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, err);
  if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
    console.error('[redis] Too many errors — resetting client');
    redis = null;
    consecutiveErrors = 0;
  }
}

function onRedisSuccess() {
  consecutiveErrors = 0;
}

// Cache key prefixes for organization
export const CACHE_KEYS = {
  // Price data
  quote: (symbol: string) => `quote:${symbol.toUpperCase()}`,
  bulkQuotes: (universe: string) => `bulk:${universe}`,
  
  // OHLCV bars
  bars: (symbol: string, timeframe: string) => `bars:${symbol.toUpperCase()}:${timeframe}`,
  
  // Computed indicators
  indicators: (symbol: string, timeframe: string) => `ind:${symbol.toUpperCase()}:${timeframe}`,
  
  // Options data
  optionsChain: (symbol: string) => `opt:chain:${symbol.toUpperCase()}`,
  optionsMetrics: (symbol: string) => `opt:metrics:${symbol.toUpperCase()}`,
  
  // Scanner results (cached for all users)
  scannerResult: (scannerName: string, universe: string) => `scan:${scannerName}:${universe}`,
  
  // Fundamentals & news (changes slowly)
  fundamentals: (symbol: string) => `fund:${symbol.toUpperCase()}`,
  news: (symbol: string) => `news:${symbol.toUpperCase()}`,
  
  // Market-wide data
  marketStatus: () => 'market:status',
  sectorPerformance: () => 'market:sectors',
  fearGreed: () => 'market:feargreed',
} as const;

// Default TTLs in seconds
export const CACHE_TTL = {
  quote: 120,          // 2 minutes - worker refreshes Tier 1 every 30-60s
  bars: 300,           // 5 minutes - worker refreshes bars each cycle
  indicators: 300,     // 5 minutes - worker computes indicators each cycle
  optionsChain: 120,   // 2 minutes - options data
  optionsMetrics: 120, // 2 minutes - computed options metrics
  scannerResult: 120,  // 2 minutes - scanner outputs
  fundamentals: 3600,  // 1 hour - fundamentals change slowly
  news: 300,           // 5 minutes - news updates periodically
  marketStatus: 120,   // 2 minutes - market status
  sectorPerformance: 300, // 5 minutes - sector data
  fearGreed: 900,      // 15 minutes - fear/greed index
} as const;

/**
 * Get cached value with automatic JSON parsing
 */
export async function getCached<T>(key: string): Promise<T | null> {
  const r = getRedis();
  if (!r) return null;
  
  try {
    const value = await r.get<T>(key);
    onRedisSuccess();
    return value;
  } catch (err) {
    onRedisError(err);
    return null;
  }
}

/**
 * Set cached value with TTL
 */
export async function setCached<T>(key: string, value: T, ttlSeconds: number): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  
  try {
    await r.set(key, value, { ex: ttlSeconds });
    onRedisSuccess();
    return true;
  } catch (err) {
    onRedisError(err);
    return false;
  }
}

/**
 * Delete cached value
 */
export async function deleteCached(key: string): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  
  try {
    await r.del(key);
    onRedisSuccess();
    return true;
  } catch (err) {
    onRedisError(err);
    return false;
  }
}

/**
 * Get multiple cached values at once
 */
export async function getCachedMulti<T>(keys: string[]): Promise<(T | null)[]> {
  const r = getRedis();
  if (!r) return keys.map(() => null);
  
  try {
    const values = await r.mget<T[]>(...keys);
    onRedisSuccess();
    return values;
  } catch (err) {
    onRedisError(err);
    return keys.map(() => null);
  }
}

/**
 * Set multiple cached values at once (pipeline)
 */
export async function setCachedMulti(entries: { key: string; value: unknown; ttl: number }[]): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  
  try {
    const pipeline = r.pipeline();
    for (const { key, value, ttl } of entries) {
      pipeline.set(key, value, { ex: ttl });
    }
    await pipeline.exec();
    onRedisSuccess();
    return true;
  } catch (err) {
    onRedisError(err);
    return false;
  }
}
