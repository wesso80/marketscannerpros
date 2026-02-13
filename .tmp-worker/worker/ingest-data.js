"use strict";
/**
 * MSP Data Ingestion Worker
 *
 * This background worker:
 * 1. Fetches OHLCV data from Alpha Vantage (rate-limited)
 * 2. Computes indicators locally (RSI, MACD, EMA, ADX, etc.)
 * 3. Stores results in Neon DB
 * 4. Updates Redis cache for instant API responses
 *
 * Run with: npm run worker:ingest
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
dotenv.config({ path: '.env.local' });
dotenv.config(); // Also try .env as fallback
const pg_1 = require("pg");
const redis_1 = require("@upstash/redis");
const rateLimiter_1 = require("../lib/rateLimiter");
const indicators_1 = require("../lib/indicators");
const redis_2 = require("../lib/redis");
// ============================================================================
// Configuration
// ============================================================================
// Env vars read lazily to allow dotenv to load first
function getEnv(key) {
    return process.env[key] || '';
}
// Refresh intervals by tier (in seconds)
const TIER_REFRESH_INTERVALS = {
    1: 30, // Tier 1: every 30 seconds
    2: 120, // Tier 2: every 2 minutes
    3: 300, // Tier 3: every 5 minutes
};
// Rate limiter: Alpha Vantage ~75 calls/minute for premium, ~5 for free
let rateLimiter = null;
function getRateLimiter() {
    if (!rateLimiter) {
        const rpm = parseInt(getEnv('ALPHA_VANTAGE_RPM') || '70', 10);
        rateLimiter = new rateLimiter_1.TokenBucket(rpm, rpm / 60);
    }
    return rateLimiter;
}
// ============================================================================
// Database & Redis Setup
// ============================================================================
let pool = null;
let redis = null;
function getPool() {
    if (!pool) {
        const dbUrl = getEnv('DATABASE_URL');
        if (!dbUrl) {
            throw new Error('DATABASE_URL not set');
        }
        pool = new pg_1.Pool({
            connectionString: dbUrl,
            max: 5,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
            ssl: { rejectUnauthorized: false },
        });
    }
    return pool;
}
function getRedis() {
    if (redis)
        return redis;
    const redisUrl = getEnv('UPSTASH_REDIS_REST_URL');
    const redisToken = getEnv('UPSTASH_REDIS_REST_TOKEN');
    if (!redisUrl || !redisToken) {
        console.warn('[worker] Redis not configured - caching disabled');
        return null;
    }
    redis = new redis_1.Redis({ url: redisUrl, token: redisToken });
    return redis;
}
async function fetchAVTimeSeries(symbol, interval = 'daily', outputsize = 'compact') {
    await getRateLimiter().take(1);
    const functionName = interval === 'daily'
        ? 'TIME_SERIES_DAILY'
        : 'TIME_SERIES_INTRADAY';
    let url = `https://www.alphavantage.co/query?function=${functionName}&symbol=${encodeURIComponent(symbol)}&outputsize=${outputsize}&entitlement=delayed&apikey=${getEnv('ALPHA_VANTAGE_API_KEY')}`;
    if (interval !== 'daily') {
        url += `&interval=${interval}`;
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
        throw new Error(`AV HTTP ${res.status} for ${symbol}`);
    }
    const json = await res.json();
    // Check for rate limit or error messages
    if (json['Note'] || json['Information']) {
        throw new Error(`AV limit: ${json['Note'] || json['Information']}`);
    }
    if (json['Error Message']) {
        throw new Error(`AV error: ${json['Error Message']}`);
    }
    // Parse time series data
    const timeSeriesKey = Object.keys(json).find(k => k.startsWith('Time Series'));
    if (!timeSeriesKey || !json[timeSeriesKey]) {
        console.warn(`[worker] No time series data for ${symbol}`);
        return [];
    }
    const timeSeries = json[timeSeriesKey];
    const bars = [];
    for (const [timestamp, values] of Object.entries(timeSeries)) {
        const v = values;
        bars.push({
            timestamp,
            open: parseFloat(v['1. open']),
            high: parseFloat(v['2. high']),
            low: parseFloat(v['3. low']),
            close: parseFloat(v['4. close']),
            volume: parseInt(v['5. volume'] || '0', 10),
        });
    }
    // Sort oldest to newest
    bars.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return bars;
}
async function fetchAVGlobalQuote(symbol) {
    await getRateLimiter().take(1);
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&entitlement=delayed&apikey=${getEnv('ALPHA_VANTAGE_API_KEY')}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
        throw new Error(`AV HTTP ${res.status} for quote ${symbol}`);
    }
    const json = await res.json();
    const quote = json['Global Quote'];
    if (!quote || !quote['05. price']) {
        return null;
    }
    return {
        price: parseFloat(quote['05. price']),
        open: parseFloat(quote['02. open'] || '0'),
        high: parseFloat(quote['03. high'] || '0'),
        low: parseFloat(quote['04. low'] || '0'),
        prevClose: parseFloat(quote['08. previous close'] || '0'),
        volume: parseInt(quote['06. volume'] || '0', 10),
        changeAmt: parseFloat(quote['09. change'] || '0'),
        changePct: parseFloat((quote['10. change percent'] || '0').replace('%', '')),
        latestDay: quote['07. latest trading day'] || new Date().toISOString().slice(0, 10),
    };
}
async function fetchAVBulkQuotes(symbols) {
    await getRateLimiter().take(1);
    const symbolList = symbols.join(',');
    const url = `https://www.alphavantage.co/query?function=REALTIME_BULK_QUOTES&symbol=${encodeURIComponent(symbolList)}&entitlement=delayed&apikey=${getEnv('ALPHA_VANTAGE_API_KEY')}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
        throw new Error(`AV bulk quotes HTTP ${res.status}`);
    }
    const json = await res.json();
    const results = new Map();
    if (json['data'] && Array.isArray(json['data'])) {
        for (const item of json['data']) {
            if (item['01. symbol']) {
                results.set(item['01. symbol'].toUpperCase(), {
                    price: parseFloat(item['05. price'] || '0'),
                    open: parseFloat(item['02. open'] || '0'),
                    high: parseFloat(item['03. high'] || '0'),
                    low: parseFloat(item['04. low'] || '0'),
                    prevClose: parseFloat(item['08. previous close'] || '0'),
                    volume: parseInt(item['06. volume'] || '0', 10),
                    changeAmt: parseFloat(item['09. change'] || '0'),
                    changePct: parseFloat((item['10. change percent'] || '0').replace('%', '')),
                });
            }
        }
    }
    return results;
}
async function fetchAVCryptoDaily(symbol) {
    await getRateLimiter().take(1);
    const url = `https://www.alphavantage.co/query?function=DIGITAL_CURRENCY_DAILY&symbol=${symbol}&market=USD&apikey=${getEnv('ALPHA_VANTAGE_API_KEY')}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
        throw new Error(`AV crypto HTTP ${res.status} for ${symbol}`);
    }
    const json = await res.json();
    const timeSeries = json['Time Series (Digital Currency Daily)'];
    if (!timeSeries) {
        console.warn(`[worker] No crypto data for ${symbol}`);
        return [];
    }
    const bars = [];
    for (const [timestamp, values] of Object.entries(timeSeries)) {
        const v = values;
        bars.push({
            timestamp,
            open: parseFloat(v['1a. open (USD)'] || v['1. open'] || '0'),
            high: parseFloat(v['2a. high (USD)'] || v['2. high'] || '0'),
            low: parseFloat(v['3a. low (USD)'] || v['3. low'] || '0'),
            close: parseFloat(v['4a. close (USD)'] || v['4. close'] || '0'),
            volume: parseFloat(v['5. volume'] || '0'),
        });
    }
    bars.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return bars;
}
// ============================================================================
// Database Operations
// ============================================================================
async function getSymbolsToFetch(tier) {
    const db = getPool();
    const query = tier
        ? 'SELECT symbol, tier, asset_type FROM symbol_universe WHERE enabled = TRUE AND tier = $1 ORDER BY last_fetched_at ASC NULLS FIRST'
        : 'SELECT symbol, tier, asset_type FROM symbol_universe WHERE enabled = TRUE ORDER BY tier ASC, last_fetched_at ASC NULLS FIRST';
    const result = await db.query(query, tier ? [tier] : []);
    return result.rows;
}
async function upsertQuote(symbol, quote) {
    const db = getPool();
    await db.query(`
    INSERT INTO quotes_latest (symbol, price, open, high, low, prev_close, volume, change_amount, change_percent, latest_trading_day, fetched_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
    ON CONFLICT (symbol) DO UPDATE SET
      price = EXCLUDED.price,
      open = EXCLUDED.open,
      high = EXCLUDED.high,
      low = EXCLUDED.low,
      prev_close = EXCLUDED.prev_close,
      volume = EXCLUDED.volume,
      change_amount = EXCLUDED.change_amount,
      change_percent = EXCLUDED.change_percent,
      latest_trading_day = EXCLUDED.latest_trading_day,
      fetched_at = NOW()
  `, [
        symbol.toUpperCase(),
        quote.price,
        quote.open,
        quote.high,
        quote.low,
        quote.prevClose,
        Math.round(Number(quote.volume) || 0), // Ensure integer for BIGINT
        quote.changeAmt,
        quote.changePct,
        quote.latestDay,
    ]);
}
async function upsertBars(symbol, timeframe, bars) {
    const db = getPool();
    // Use batch insert
    if (bars.length === 0)
        return;
    const values = [];
    const placeholders = [];
    let paramIndex = 1;
    for (const bar of bars.slice(-500)) { // Keep last 500 bars
        placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7})`);
        // Ensure volume is a valid integer for BIGINT
        const volumeInt = Math.round(Number(bar.volume) || 0);
        values.push(symbol.toUpperCase(), timeframe, bar.timestamp, bar.open, bar.high, bar.low, bar.close, volumeInt);
        paramIndex += 8;
    }
    await db.query(`
    INSERT INTO ohlcv_bars (symbol, timeframe, ts, open, high, low, close, volume)
    VALUES ${placeholders.join(', ')}
    ON CONFLICT (symbol, timeframe, ts) DO UPDATE SET
      open = EXCLUDED.open,
      high = EXCLUDED.high,
      low = EXCLUDED.low,
      close = EXCLUDED.close,
      volume = EXCLUDED.volume
  `, values);
}
async function upsertIndicators(symbol, timeframe, indicators) {
    const db = getPool();
    await db.query(`
    INSERT INTO indicators_latest (
      symbol, timeframe, rsi14, macd_line, macd_signal, macd_hist,
      ema9, ema20, ema50, ema200, sma20, sma50, sma200,
      atr14, adx14, plus_di, minus_di, stoch_k, stoch_d, cci20,
      bb_upper, bb_middle, bb_lower, obv, vwap, in_squeeze, squeeze_strength, computed_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
      $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, NOW()
    )
    ON CONFLICT (symbol, timeframe) DO UPDATE SET
      rsi14 = EXCLUDED.rsi14,
      macd_line = EXCLUDED.macd_line,
      macd_signal = EXCLUDED.macd_signal,
      macd_hist = EXCLUDED.macd_hist,
      ema9 = EXCLUDED.ema9,
      ema20 = EXCLUDED.ema20,
      ema50 = EXCLUDED.ema50,
      ema200 = EXCLUDED.ema200,
      sma20 = EXCLUDED.sma20,
      sma50 = EXCLUDED.sma50,
      sma200 = EXCLUDED.sma200,
      atr14 = EXCLUDED.atr14,
      adx14 = EXCLUDED.adx14,
      plus_di = EXCLUDED.plus_di,
      minus_di = EXCLUDED.minus_di,
      stoch_k = EXCLUDED.stoch_k,
      stoch_d = EXCLUDED.stoch_d,
      cci20 = EXCLUDED.cci20,
      bb_upper = EXCLUDED.bb_upper,
      bb_middle = EXCLUDED.bb_middle,
      bb_lower = EXCLUDED.bb_lower,
      obv = EXCLUDED.obv,
      vwap = EXCLUDED.vwap,
      in_squeeze = EXCLUDED.in_squeeze,
      squeeze_strength = EXCLUDED.squeeze_strength,
      computed_at = NOW()
  `, [
        symbol.toUpperCase(),
        timeframe,
        indicators.rsi14 ?? null,
        indicators.macdLine ?? null,
        indicators.macdSignal ?? null,
        indicators.macdHist ?? null,
        indicators.ema9 ?? null,
        indicators.ema20 ?? null,
        indicators.ema50 ?? null,
        indicators.ema200 ?? null,
        indicators.sma20 ?? null,
        indicators.sma50 ?? null,
        indicators.sma200 ?? null,
        indicators.atr14 ?? null,
        indicators.adx14 ?? null,
        indicators.plusDI ?? null,
        indicators.minusDI ?? null,
        indicators.stochK ?? null,
        indicators.stochD ?? null,
        indicators.cci20 ?? null,
        indicators.bbUpper ?? null,
        indicators.bbMiddle ?? null,
        indicators.bbLower ?? null,
        indicators.obv != null ? Math.round(indicators.obv) : null, // Round OBV to BIGINT
        indicators.vwap ?? null,
        indicators.inSqueeze ?? null,
        indicators.squeezeStrength ?? null,
    ]);
}
async function markSymbolFetched(symbol, success) {
    const db = getPool();
    if (success) {
        await db.query(`
      UPDATE symbol_universe 
      SET last_fetched_at = NOW(), fetch_error_count = 0, updated_at = NOW()
      WHERE symbol = $1
    `, [symbol.toUpperCase()]);
    }
    else {
        await db.query(`
      UPDATE symbol_universe 
      SET fetch_error_count = fetch_error_count + 1, updated_at = NOW()
      WHERE symbol = $1
    `, [symbol.toUpperCase()]);
    }
}
async function logWorkerRun(name, stats, status, error) {
    const db = getPool();
    await db.query(`
    INSERT INTO worker_runs (worker_name, symbols_processed, api_calls_made, errors_count, status, error_message, finished_at, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
  `, [
        name,
        stats.symbolsProcessed || 0,
        stats.apiCalls || 0,
        stats.errors || 0,
        status,
        error || null,
        JSON.stringify(stats),
    ]);
}
// ============================================================================
// Cache Operations
// ============================================================================
async function cacheQuote(symbol, quote) {
    const r = getRedis();
    if (!r)
        return;
    try {
        await r.set(redis_2.CACHE_KEYS.quote(symbol), quote, { ex: redis_2.CACHE_TTL.quote });
    }
    catch (err) {
        console.error(`[worker] Cache error for quote ${symbol}:`, err);
    }
}
async function cacheIndicators(symbol, timeframe, indicators) {
    const r = getRedis();
    if (!r)
        return;
    try {
        await r.set(redis_2.CACHE_KEYS.indicators(symbol, timeframe), indicators, { ex: redis_2.CACHE_TTL.indicators });
    }
    catch (err) {
        console.error(`[worker] Cache error for indicators ${symbol}:`, err);
    }
}
// ============================================================================
// Main Processing Functions
// ============================================================================
async function processEquitySymbol(symbol) {
    let apiCalls = 0;
    try {
        // 1. Fetch quote
        const quote = await fetchAVGlobalQuote(symbol);
        apiCalls++;
        if (quote) {
            await upsertQuote(symbol, quote);
            await cacheQuote(symbol, quote);
        }
        // 2. Fetch daily bars
        const bars = await fetchAVTimeSeries(symbol, 'daily', 'compact');
        apiCalls++;
        if (bars.length > 0) {
            await upsertBars(symbol, 'daily', bars);
            // 3. Compute indicators locally (no API call!)
            const ohlcvBars = bars.map(b => ({
                timestamp: b.timestamp,
                open: b.open,
                high: b.high,
                low: b.low,
                close: b.close,
                volume: b.volume,
            }));
            const indicators = (0, indicators_1.calculateAllIndicators)(ohlcvBars);
            const squeeze = (0, indicators_1.detectSqueeze)(ohlcvBars);
            const fullIndicators = {
                ...indicators,
                inSqueeze: squeeze?.inSqueeze ?? false,
                squeezeStrength: squeeze?.squeezeStrength ?? 0,
            };
            await upsertIndicators(symbol, 'daily', fullIndicators);
            await cacheIndicators(symbol, 'daily', fullIndicators);
        }
        await markSymbolFetched(symbol, true);
        return { apiCalls, success: true };
    }
    catch (err) {
        console.error(`[worker] Error processing ${symbol}:`, err?.message || err);
        await markSymbolFetched(symbol, false);
        return { apiCalls, success: false };
    }
}
async function processCryptoSymbol(symbol) {
    let apiCalls = 0;
    try {
        const bars = await fetchAVCryptoDaily(symbol);
        apiCalls++;
        if (bars.length > 0) {
            await upsertBars(symbol, 'daily', bars);
            // Latest bar as quote
            const latest = bars[bars.length - 1];
            const prev = bars.length > 1 ? bars[bars.length - 2] : latest;
            const changeAmt = latest.close - prev.close;
            const changePct = prev.close > 0 ? (changeAmt / prev.close) * 100 : 0;
            const quote = {
                price: latest.close,
                open: latest.open,
                high: latest.high,
                low: latest.low,
                prevClose: prev.close,
                volume: latest.volume,
                changeAmt,
                changePct,
                latestDay: latest.timestamp.slice(0, 10),
            };
            await upsertQuote(symbol, quote);
            await cacheQuote(symbol, quote);
            // Compute indicators
            const ohlcvBars = bars.map(b => ({
                timestamp: b.timestamp,
                open: b.open,
                high: b.high,
                low: b.low,
                close: b.close,
                volume: b.volume,
            }));
            const indicators = (0, indicators_1.calculateAllIndicators)(ohlcvBars);
            const squeeze = (0, indicators_1.detectSqueeze)(ohlcvBars);
            const fullIndicators = {
                ...indicators,
                inSqueeze: squeeze?.inSqueeze ?? false,
                squeezeStrength: squeeze?.squeezeStrength ?? 0,
            };
            await upsertIndicators(symbol, 'daily', fullIndicators);
            await cacheIndicators(symbol, 'daily', fullIndicators);
        }
        await markSymbolFetched(symbol, true);
        return { apiCalls, success: true };
    }
    catch (err) {
        console.error(`[worker] Error processing crypto ${symbol}:`, err?.message || err);
        await markSymbolFetched(symbol, false);
        return { apiCalls, success: false };
    }
}
// ============================================================================
// Main Worker Loop
// ============================================================================
async function runIngestionCycle() {
    const stats = { symbolsProcessed: 0, apiCalls: 0, errors: 0 };
    const symbols = await getSymbolsToFetch();
    console.log(`[worker] Processing ${symbols.length} symbols...`);
    for (const { symbol, tier, asset_type } of symbols) {
        try {
            let result;
            if (asset_type === 'crypto') {
                result = await processCryptoSymbol(symbol);
            }
            else {
                result = await processEquitySymbol(symbol);
            }
            stats.apiCalls += result.apiCalls;
            stats.symbolsProcessed++;
            if (!result.success) {
                stats.errors++;
            }
            console.log(`[worker] Processed ${symbol} (${asset_type}, tier ${tier}) - ${result.success ? 'OK' : 'FAIL'}`);
            // Small delay between symbols to be nice to the API
            await (0, rateLimiter_1.sleep)(100);
        }
        catch (err) {
            console.error(`[worker] Fatal error for ${symbol}:`, err?.message || err);
            stats.errors++;
        }
    }
    return stats;
}
async function main() {
    console.log('[worker] MSP Data Ingestion Worker starting...');
    if (!getEnv('ALPHA_VANTAGE_API_KEY')) {
        console.error('[worker] ALPHA_VANTAGE_API_KEY not set');
        process.exit(1);
    }
    if (!getEnv('DATABASE_URL')) {
        console.error('[worker] DATABASE_URL not set');
        process.exit(1);
    }
    const rpm = parseInt(getEnv('ALPHA_VANTAGE_RPM') || '70', 10);
    console.log(`[worker] Rate limit: ${rpm} requests/minute`);
    console.log(`[worker] Redis: ${getEnv('UPSTASH_REDIS_REST_URL') ? 'enabled' : 'disabled'}`);
    let cycleCount = 0;
    const CYCLE_INTERVAL_MS = 60000; // Run full cycle every 60 seconds
    while (true) {
        cycleCount++;
        console.log(`\n[worker] === Cycle ${cycleCount} starting ===`);
        const startTime = Date.now();
        try {
            const stats = await runIngestionCycle();
            const duration = Math.round((Date.now() - startTime) / 1000);
            console.log(`[worker] Cycle ${cycleCount} completed in ${duration}s`);
            console.log(`[worker] Stats: ${stats.symbolsProcessed} symbols, ${stats.apiCalls} API calls, ${stats.errors} errors`);
            await logWorkerRun('ingest-main', stats, 'completed');
        }
        catch (err) {
            console.error(`[worker] Cycle ${cycleCount} failed:`, err?.message || err);
            await logWorkerRun('ingest-main', {}, 'failed', err?.message || String(err));
        }
        // Wait for next cycle
        const elapsed = Date.now() - startTime;
        const waitTime = Math.max(0, CYCLE_INTERVAL_MS - elapsed);
        console.log(`[worker] Waiting ${Math.round(waitTime / 1000)}s until next cycle...`);
        await (0, rateLimiter_1.sleep)(waitTime);
    }
}
// Run if executed directly
main().catch((err) => {
    console.error('[worker] Fatal error:', err);
    process.exit(1);
});
