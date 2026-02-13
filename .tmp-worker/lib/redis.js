"use strict";
/**
 * Redis client for MSP caching layer
 * Uses Upstash Redis for serverless-compatible caching
 *
 * Pattern:
 * - Worker writes: symbol data, computed indicators, scanner results
 * - API reads: check cache first, fallback to Neon DB
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CACHE_TTL = exports.CACHE_KEYS = void 0;
exports.getRedis = getRedis;
exports.getCached = getCached;
exports.setCached = setCached;
exports.deleteCached = deleteCached;
exports.getCachedMulti = getCachedMulti;
exports.setCachedMulti = setCachedMulti;
const redis_1 = require("@upstash/redis");
// Singleton pattern for Redis client
let redis = null;
function getRedis() {
    if (redis)
        return redis;
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
        console.warn('[redis] Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN - caching disabled');
        return null;
    }
    redis = new redis_1.Redis({ url, token });
    return redis;
}
// Cache key prefixes for organization
exports.CACHE_KEYS = {
    // Price data
    quote: (symbol) => `quote:${symbol.toUpperCase()}`,
    bulkQuotes: (universe) => `bulk:${universe}`,
    // OHLCV bars
    bars: (symbol, timeframe) => `bars:${symbol.toUpperCase()}:${timeframe}`,
    // Computed indicators
    indicators: (symbol, timeframe) => `ind:${symbol.toUpperCase()}:${timeframe}`,
    // Options data
    optionsChain: (symbol) => `opt:chain:${symbol.toUpperCase()}`,
    optionsMetrics: (symbol) => `opt:metrics:${symbol.toUpperCase()}`,
    // Scanner results (cached for all users)
    scannerResult: (scannerName, universe) => `scan:${scannerName}:${universe}`,
    // Fundamentals & news (changes slowly)
    fundamentals: (symbol) => `fund:${symbol.toUpperCase()}`,
    news: (symbol) => `news:${symbol.toUpperCase()}`,
    // Market-wide data
    marketStatus: () => 'market:status',
    sectorPerformance: () => 'market:sectors',
    fearGreed: () => 'market:feargreed',
};
// Default TTLs in seconds
exports.CACHE_TTL = {
    quote: 30, // 30 seconds - prices update frequently
    bars: 60, // 1 minute - intraday bars
    indicators: 60, // 1 minute - computed indicators
    optionsChain: 30, // 30 seconds - options quotes
    optionsMetrics: 30, // 30 seconds - computed options metrics
    scannerResult: 60, // 1 minute - scanner outputs
    fundamentals: 3600, // 1 hour - fundamentals change slowly
    news: 300, // 5 minutes - news updates periodically
    marketStatus: 60, // 1 minute - market status
    sectorPerformance: 300, // 5 minutes - sector data
    fearGreed: 900, // 15 minutes - fear/greed index
};
/**
 * Get cached value with automatic JSON parsing
 */
async function getCached(key) {
    const r = getRedis();
    if (!r)
        return null;
    try {
        const value = await r.get(key);
        return value;
    }
    catch (err) {
        console.error(`[redis] get error for ${key}:`, err);
        return null;
    }
}
/**
 * Set cached value with TTL
 */
async function setCached(key, value, ttlSeconds) {
    const r = getRedis();
    if (!r)
        return false;
    try {
        await r.set(key, value, { ex: ttlSeconds });
        return true;
    }
    catch (err) {
        console.error(`[redis] set error for ${key}:`, err);
        return false;
    }
}
/**
 * Delete cached value
 */
async function deleteCached(key) {
    const r = getRedis();
    if (!r)
        return false;
    try {
        await r.del(key);
        return true;
    }
    catch (err) {
        console.error(`[redis] del error for ${key}:`, err);
        return false;
    }
}
/**
 * Get multiple cached values at once
 */
async function getCachedMulti(keys) {
    const r = getRedis();
    if (!r)
        return keys.map(() => null);
    try {
        const values = await r.mget(...keys);
        return values;
    }
    catch (err) {
        console.error(`[redis] mget error:`, err);
        return keys.map(() => null);
    }
}
/**
 * Set multiple cached values at once (pipeline)
 */
async function setCachedMulti(entries) {
    const r = getRedis();
    if (!r)
        return false;
    try {
        const pipeline = r.pipeline();
        for (const { key, value, ttl } of entries) {
            pipeline.set(key, value, { ex: ttl });
        }
        await pipeline.exec();
        return true;
    }
    catch (err) {
        console.error(`[redis] pipeline set error:`, err);
        return false;
    }
}
