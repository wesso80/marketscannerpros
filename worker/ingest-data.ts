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

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config(); // Also try .env as fallback

import { Pool } from 'pg';
import { Redis } from '@upstash/redis';
import { TokenBucket, sleep, retryWithBackoff } from '../lib/rateLimiter';
import { calculateAllIndicators, detectSqueeze, getIndicatorWarmupStatus, OHLCVBar } from '../lib/indicators';
import { CACHE_KEYS, CACHE_TTL } from '../lib/redis';
import { recordSignalsBatch } from '../lib/signalService';
import { COINGECKO_ID_MAP, getOHLC as getCoinGeckoOHLC, getOHLCRange as getCoinGeckoOHLCRange, resolveSymbolToId } from '../lib/coingecko';

// ============================================================================
// Signal Detection Types
// ============================================================================

interface DetectedSignal {
  signalType: string;       // 'squeeze', 'macd_cross', 'rsi_bounce', 'momentum'
  direction: 'bullish' | 'bearish';
  score: number;            // 0-100
  features: Record<string, any>;
}

// Previous indicators cache (for detecting transitions)
const previousIndicators = new Map<string, any>();

// ============================================================================
// Configuration
// ============================================================================

// Env vars read lazily to allow dotenv to load first
function getEnv(key: string): string {
  return process.env[key] || '';
}

// Refresh intervals by tier (in seconds)
// - Crypto defaults are tuned for CoinGecko value/coverage
// - Non-crypto defaults preserve legacy behavior
const CRYPTO_TIER_REFRESH_INTERVALS: Record<number, number> = {
  1: 45,   // Tier 1: every 45 seconds
  2: 120,  // Tier 2: every 2 minutes
  3: 600,  // Tier 3: every 10 minutes
};

const CRYPTO_OFFHOURS_TIER_REFRESH_INTERVALS: Record<number, number> = {
  1: 120,   // Tier 1: every 2 minutes
  2: 300,   // Tier 2: every 5 minutes
  3: 900,   // Tier 3: every 15 minutes
};

const NON_CRYPTO_TIER_REFRESH_INTERVALS: Record<number, number> = {
  1: 30,   // Tier 1: every 30 seconds
  2: 120,  // Tier 2: every 2 minutes
  3: 300,  // Tier 3: every 5 minutes
};

function getPositiveIntFromEnv(key: string, fallback: number): number {
  const raw = Number.parseInt(getEnv(key), 10);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function getBoolFromEnv(key: string, fallback: boolean): boolean {
  const raw = (getEnv(key) || '').trim().toLowerCase();
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

type CryptoCadenceMode = 'market' | 'offhours';
type EquitySessionMode = 'market' | 'premarket' | 'postmarket' | 'closed';

function parseClockToMinuteOfDay(raw: string): number | null {
  const trimmed = (raw || '').trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return null;

  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function parseSlotMinutes(raw: string, fallback: string[]): number[] {
  const source = (raw || '').trim();
  const tokens = source
    ? source.split(',').map((entry) => entry.trim()).filter(Boolean)
    : fallback;

  const parsed = tokens
    .map(parseClockToMinuteOfDay)
    .filter((value): value is number => value != null);

  return Array.from(new Set(parsed)).sort((left, right) => left - right);
}

function getTimePartsForZone(timezone: string, now = new Date()): {
  weekday: string;
  minuteOfDay: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const weekday = parts.find((part) => part.type === 'weekday')?.value || 'Sun';
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || '0');
  return {
    weekday,
    minuteOfDay: hour * 60 + minute,
  };
}

function getUsMarketSessionState(now = new Date()): {
  mode: CryptoCadenceMode;
  timezone: string;
  openMinutes: number;
  closeMinutes: number;
} {
  const timezone = getEnv('CG_MARKET_TIMEZONE') || 'America/New_York';
  const openHour = getPositiveIntFromEnv('CG_MARKET_OPEN_HOUR', 9);
  const openMinute = getPositiveIntFromEnv('CG_MARKET_OPEN_MINUTE', 30);
  const closeHour = getPositiveIntFromEnv('CG_MARKET_CLOSE_HOUR', 16);
  const closeMinute = getPositiveIntFromEnv('CG_MARKET_CLOSE_MINUTE', 0);
  const openMinutes = openHour * 60 + openMinute;
  const closeMinutes = closeHour * 60 + closeMinute;

  const { weekday, minuteOfDay } = getTimePartsForZone(timezone, now);
  const isWeekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekday);
  const inSession = isWeekday && minuteOfDay >= openMinutes && minuteOfDay < closeMinutes;

  return {
    mode: inSession ? 'market' : 'offhours',
    timezone,
    openMinutes,
    closeMinutes,
  };
}

function getUsEquitySessionState(now = new Date()): {
  mode: EquitySessionMode;
  timezone: string;
  minuteOfDay: number;
  premarketScanSlots: number[];
  postmarketScanSlots: number[];
  slotToleranceMinutes: number;
} {
  const timezone = getEnv('EQUITY_MARKET_TIMEZONE') || getEnv('CG_MARKET_TIMEZONE') || 'America/New_York';
  const marketOpen = getPositiveIntFromEnv('EQUITY_MARKET_OPEN_HOUR', 9) * 60 + getPositiveIntFromEnv('EQUITY_MARKET_OPEN_MINUTE', 30);
  const marketClose = getPositiveIntFromEnv('EQUITY_MARKET_CLOSE_HOUR', 16) * 60 + getPositiveIntFromEnv('EQUITY_MARKET_CLOSE_MINUTE', 0);
  const premarketStart = getPositiveIntFromEnv('EQUITY_PREMARKET_START_HOUR', 4) * 60 + getPositiveIntFromEnv('EQUITY_PREMARKET_START_MINUTE', 0);
  const postmarketEnd = getPositiveIntFromEnv('EQUITY_POSTMARKET_END_HOUR', 20) * 60 + getPositiveIntFromEnv('EQUITY_POSTMARKET_END_MINUTE', 0);

  const { weekday, minuteOfDay } = getTimePartsForZone(timezone, now);
  const isWeekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekday);
  const premarketScanSlots = parseSlotMinutes(getEnv('EQUITY_PREMARKET_SCAN_TIMES'), ['04:15', '08:45']);
  const postmarketScanSlots = parseSlotMinutes(getEnv('EQUITY_POSTMARKET_SCAN_TIMES'), ['16:15', '19:30']);
  const slotToleranceMinutes = Math.max(0, getPositiveIntFromEnv('EQUITY_OFFHOURS_SLOT_TOLERANCE_MINUTES', 0));

  if (!isWeekday) {
    return { mode: 'closed', timezone, minuteOfDay, premarketScanSlots, postmarketScanSlots, slotToleranceMinutes };
  }

  if (minuteOfDay >= marketOpen && minuteOfDay < marketClose) {
    return { mode: 'market', timezone, minuteOfDay, premarketScanSlots, postmarketScanSlots, slotToleranceMinutes };
  }

  if (minuteOfDay >= premarketStart && minuteOfDay < marketOpen) {
    return { mode: 'premarket', timezone, minuteOfDay, premarketScanSlots, postmarketScanSlots, slotToleranceMinutes };
  }

  if (minuteOfDay >= marketClose && minuteOfDay < postmarketEnd) {
    return { mode: 'postmarket', timezone, minuteOfDay, premarketScanSlots, postmarketScanSlots, slotToleranceMinutes };
  }

  return { mode: 'closed', timezone, minuteOfDay, premarketScanSlots, postmarketScanSlots, slotToleranceMinutes };
}

function isScanSlotMatch(minuteOfDay: number, slots: number[], toleranceMinutes: number): boolean {
  return slots.some((slotMinute) => Math.abs(minuteOfDay - slotMinute) <= toleranceMinutes);
}

function getTierRefreshIntervalSeconds(assetType: string, tier: number, cadenceMode: CryptoCadenceMode = 'market'): number {
  const safeTier = Number.isFinite(tier) ? Math.max(1, Math.min(3, Math.floor(tier))) : 2;
  const isCrypto = assetType === 'crypto';

  if (isCrypto) {
    if (cadenceMode === 'offhours') {
      if (safeTier === 1) return getPositiveIntFromEnv('CG_OFFHOURS_TIER1_SECONDS', CRYPTO_OFFHOURS_TIER_REFRESH_INTERVALS[1]);
      if (safeTier === 2) return getPositiveIntFromEnv('CG_OFFHOURS_TIER2_SECONDS', CRYPTO_OFFHOURS_TIER_REFRESH_INTERVALS[2]);
      return getPositiveIntFromEnv('CG_OFFHOURS_TIER3_SECONDS', CRYPTO_OFFHOURS_TIER_REFRESH_INTERVALS[3]);
    }

    if (safeTier === 1) return getPositiveIntFromEnv('CG_TIER1_SECONDS', CRYPTO_TIER_REFRESH_INTERVALS[1]);
    if (safeTier === 2) return getPositiveIntFromEnv('CG_TIER2_SECONDS', CRYPTO_TIER_REFRESH_INTERVALS[2]);
    return getPositiveIntFromEnv('CG_TIER3_SECONDS', CRYPTO_TIER_REFRESH_INTERVALS[3]);
  }

  if (safeTier === 1) return getPositiveIntFromEnv('INGEST_TIER1_SECONDS', NON_CRYPTO_TIER_REFRESH_INTERVALS[1]);
  if (safeTier === 2) return getPositiveIntFromEnv('INGEST_TIER2_SECONDS', NON_CRYPTO_TIER_REFRESH_INTERVALS[2]);
  return getPositiveIntFromEnv('INGEST_TIER3_SECONDS', NON_CRYPTO_TIER_REFRESH_INTERVALS[3]);
}

function isDueForFetch(lastFetchedAt: Date | string | null | undefined, intervalSeconds: number): boolean {
  if (!lastFetchedAt) return true;
  const parsed = lastFetchedAt instanceof Date ? lastFetchedAt : new Date(lastFetchedAt);
  if (Number.isNaN(parsed.getTime())) return true;
  return Date.now() - parsed.getTime() >= intervalSeconds * 1000;
}

// Rate limiter: Alpha Vantage ~75 calls/minute for premium, ~5 for free
let rateLimiter: TokenBucket | null = null;
function getRateLimiter(): TokenBucket {
  if (!rateLimiter) {
    const rpm = parseInt(getEnv('ALPHA_VANTAGE_RPM') || '70', 10);
    const burstPerSecond = parseInt(getEnv('ALPHA_VANTAGE_BURST_PER_SECOND') || '4', 10);
    const burstCapacity = Math.max(1, Math.min(rpm, burstPerSecond));
    rateLimiter = new TokenBucket(burstCapacity, rpm / 60);
  }
  return rateLimiter;
}

// ============================================================================
// Database & Redis Setup
// ============================================================================

let pool: Pool | null = null;
let redis: Redis | null = null;

function hashWorkerLaneToKey(lane: string): number {
  let hash = 0;
  const input = `msp-ingest-lane-${lane}`;
  for (let index = 0; index < input.length; index++) {
    hash = ((hash << 5) - hash + input.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) || 1;
}

async function acquireWorkerLaneLock(lane: string): Promise<(() => Promise<void>) | null> {
  const db = getPool();
  const client = await db.connect();
  const lockKey = hashWorkerLaneToKey(lane);

  try {
    const result = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1) AS locked', [lockKey]);
    const locked = result.rows[0]?.locked === true;

    if (!locked) {
      client.release();
      return null;
    }

    return async () => {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [lockKey]);
      } finally {
        client.release();
      }
    };
  } catch (error) {
    client.release();
    throw error;
  }
}

function getPool(): Pool {
  if (!pool) {
    const dbUrl = getEnv('DATABASE_URL');
    if (!dbUrl) {
      throw new Error('DATABASE_URL not set');
    }
    pool = new Pool({
      connectionString: dbUrl,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

function getRedis(): Redis | null {
  if (redis) return redis;
  const redisUrl = getEnv('UPSTASH_REDIS_REST_URL');
  const redisToken = getEnv('UPSTASH_REDIS_REST_TOKEN');
  if (!redisUrl || !redisToken) {
    console.warn('[worker] Redis not configured - caching disabled');
    return null;
  }
  redis = new Redis({ url: redisUrl, token: redisToken });
  return redis;
}

// ============================================================================
// Alpha Vantage API Wrapper
// ============================================================================

interface AVBar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function fetchAVTimeSeries(
  symbol: string,
  interval: string = 'daily',
  outputsize: string = 'compact'
): Promise<AVBar[]> {
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
  const bars: AVBar[] = [];

  for (const [timestamp, values] of Object.entries(timeSeries)) {
    const v = values as Record<string, string>;
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

async function fetchAVGlobalQuote(symbol: string): Promise<{
  price: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  changeAmt: number;
  changePct: number;
  latestDay: string;
} | null> {
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

async function fetchAVBulkQuotes(symbols: string[]): Promise<Map<string, any>> {
  await getRateLimiter().take(1);

  const symbolList = symbols.join(',');
  const url = `https://www.alphavantage.co/query?function=REALTIME_BULK_QUOTES&symbol=${encodeURIComponent(symbolList)}&entitlement=delayed&apikey=${getEnv('ALPHA_VANTAGE_API_KEY')}`;
  
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    throw new Error(`AV bulk quotes HTTP ${res.status}`);
  }

  const json = await res.json();
  const results = new Map<string, any>();

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

/**
 * Fetch crypto OHLC from CoinGecko (preferred - no rate limit issues)
 * Returns multi-year daily candles when range endpoint is available
 */
async function fetchCoinGeckoDaily(symbol: string): Promise<AVBar[]> {
  // Map symbol to CoinGecko ID
  const normalized = symbol.toUpperCase();
  const allowDynamicResolve = getBoolFromEnv('WORKER_CG_RESOLVE_UNMAPPED', false);
  const ohlcRetries = getPositiveIntFromEnv('WORKER_CG_OHLC_RETRIES', 1);
  const ohlcTimeoutMs = getPositiveIntFromEnv('WORKER_CG_OHLC_TIMEOUT_MS', 6000);
  const requestedHistoryDays = getPositiveIntFromEnv('WORKER_CG_HISTORY_DAYS', 3650);
  const historyDays = Math.max(30, Math.min(3650, requestedHistoryDays));
  const mappedId =
    COINGECKO_ID_MAP[normalized] ||
    COINGECKO_ID_MAP[normalized.replace('USDT', '')];
  const coinId =
    mappedId ||
    (allowDynamicResolve ? await resolveSymbolToId(normalized) : null);
  
  if (!coinId) {
    if (!allowDynamicResolve) {
      console.warn(`[worker] No CoinGecko mapping for ${symbol} (dynamic resolve disabled)`);
    } else {
      console.warn(`[worker] No CoinGecko mapping for ${symbol}`);
    }
    return [];
  }

  try {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const fromSeconds = nowSeconds - (historyDays * 24 * 60 * 60);

    let ohlcData = await getCoinGeckoOHLCRange(coinId, fromSeconds, nowSeconds, {
      retries: ohlcRetries,
      timeoutMs: ohlcTimeoutMs,
    });

    if (!ohlcData || ohlcData.length === 0) {
      ohlcData = await getCoinGeckoOHLC(coinId, 365, {
        retries: ohlcRetries,
        timeoutMs: ohlcTimeoutMs,
      });
    }
    
    if (!ohlcData || ohlcData.length === 0) {
      console.warn(`[worker] No CoinGecko OHLC data for ${symbol} (${coinId})`);
      return [];
    }

    // CoinGecko returns [timestamp, open, high, low, close]
    const bars: AVBar[] = ohlcData.map(candle => ({
      timestamp: new Date(candle[0]).toISOString().slice(0, 10),
      open: candle[1],
      high: candle[2],
      low: candle[3],
      close: candle[4],
      volume: 0, // CoinGecko OHLC doesn't include volume
    }));

    // Sort oldest first
    bars.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    console.log(`[worker] CoinGecko: Got ${bars.length} bars for ${symbol} (requested ${historyDays}d)`);
    return bars;

  } catch (err: any) {
    console.error(`[worker] CoinGecko fetch error for ${symbol}:`, err?.message || err);
    return [];
  }
}

// ============================================================================
// Database Operations
// ============================================================================

async function getSymbolsToFetch(
  tier?: number,
  options?: { includeForex?: boolean }
): Promise<Array<{ symbol: string; tier: number; asset_type: string; last_fetched_at?: Date | string | null }>> {
  const db = getPool();
  const includeForex = options?.includeForex === true;

  let query = 'SELECT symbol, tier, asset_type, last_fetched_at FROM symbol_universe WHERE enabled = TRUE';
  const params: Array<string | number> = [];

  if (tier) {
    params.push(tier);
    query += ` AND tier = $${params.length}`;
  }

  if (!includeForex) {
    query += ` AND COALESCE(asset_type, 'equity') <> 'forex'`;
  }

  query += ' ORDER BY tier ASC, last_fetched_at ASC NULLS FIRST';

  const result = await db.query(query, params);
  return result.rows;
}

function normalizeBarTimestamp(timestamp: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(timestamp)) {
    return `${timestamp}T00:00:00.000Z`;
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return timestamp;
  }

  return parsed.toISOString();
}

async function ensureIngestionSchema(): Promise<void> {
  const db = getPool();

  await db.query(`
    ALTER TABLE indicators_latest
    ADD COLUMN IF NOT EXISTS warmup_json JSONB
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_indicators_latest_warmup_json
    ON indicators_latest USING GIN (warmup_json)
  `);
}

async function upsertQuote(symbol: string, quote: any): Promise<void> {
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

async function upsertBars(symbol: string, timeframe: string, bars: AVBar[]): Promise<void> {
  const db = getPool();
  
  // Use batch insert
  if (bars.length === 0) return;

  const dedupedByTs = new Map<string, AVBar>();
  for (const bar of bars.slice(-500)) {
    const normalizedTs = normalizeBarTimestamp(bar.timestamp);
    dedupedByTs.set(normalizedTs, { ...bar, timestamp: normalizedTs });
  }

  const dedupedBars = Array.from(dedupedByTs.values())
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (dedupedBars.length === 0) return;

  const values: any[] = [];
  const placeholders: string[] = [];
  let paramIndex = 1;

  for (const bar of dedupedBars) {
    placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7})`);
    // Ensure volume is a valid integer for BIGINT
    const volumeInt = Math.round(Number(bar.volume) || 0);
    values.push(
      symbol.toUpperCase(),
      timeframe,
      bar.timestamp,
      bar.open,
      bar.high,
      bar.low,
      bar.close,
      volumeInt
    );
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

async function upsertIndicators(symbol: string, timeframe: string, indicators: any): Promise<void> {
  const db = getPool();
  await db.query(`
    INSERT INTO indicators_latest (
      symbol, timeframe, rsi14, macd_line, macd_signal, macd_hist,
      ema9, ema20, ema50, ema200, sma20, sma50, sma200,
      atr14, adx14, plus_di, minus_di, stoch_k, stoch_d, cci20,
      bb_upper, bb_middle, bb_lower, obv, vwap, in_squeeze, squeeze_strength, warmup_json, computed_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
      $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28::jsonb, NOW()
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
        warmup_json = EXCLUDED.warmup_json,
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
    indicators.warmup ? JSON.stringify(indicators.warmup) : null,
  ]);
}

async function markSymbolFetched(symbol: string, success: boolean): Promise<void> {
  const db = getPool();
  if (success) {
    await db.query(`
      UPDATE symbol_universe 
      SET last_fetched_at = NOW(), fetch_error_count = 0, updated_at = NOW()
      WHERE symbol = $1
    `, [symbol.toUpperCase()]);
  } else {
    await db.query(`
      UPDATE symbol_universe 
      SET fetch_error_count = fetch_error_count + 1, updated_at = NOW()
      WHERE symbol = $1
    `, [symbol.toUpperCase()]);
  }
}

async function markSymbolNoData(symbol: string): Promise<void> {
  const db = getPool();
  await db.query(`
    UPDATE symbol_universe
    SET last_fetched_at = NOW(), fetch_error_count = fetch_error_count + 1, updated_at = NOW()
    WHERE symbol = $1
  `, [symbol.toUpperCase()]);
}

async function logWorkerRun(name: string, stats: any, status: string, error?: string): Promise<void> {
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

async function cacheQuote(symbol: string, quote: any): Promise<void> {
  const r = getRedis();
  if (!r) return;
  
  try {
    await r.set(CACHE_KEYS.quote(symbol), quote, { ex: CACHE_TTL.quote });
  } catch (err) {
    console.error(`[worker] Cache error for quote ${symbol}:`, err);
  }
}

async function cacheIndicators(symbol: string, timeframe: string, indicators: any): Promise<void> {
  const r = getRedis();
  if (!r) return;
  
  try {
    await r.set(CACHE_KEYS.indicators(symbol, timeframe), indicators, { ex: CACHE_TTL.indicators });
  } catch (err) {
    console.error(`[worker] Cache error for indicators ${symbol}:`, err);
  }
}

// ============================================================================
// Signal Detection (runs on every symbol update)
// ============================================================================

const SCANNER_VERSION = 'v3.0';

/**
 * Detect actionable signals based on indicator transitions.
 * This runs automatically on the full universe, not user-triggered.
 */
function detectSignals(
  symbol: string,
  currentIndicators: any,
  currentPrice: number
): DetectedSignal[] {
  const signals: DetectedSignal[] = [];
  const prevIndicators = previousIndicators.get(symbol);
  
  // Skip if no previous data (need transition detection)
  if (!prevIndicators) {
    previousIndicators.set(symbol, { ...currentIndicators });
    return signals;
  }
  
  const {
    rsi14, macdHist, macdLine, macdSignal,
    ema9, ema20, ema50, ema200,
    adx14, plusDI, minusDI,
    stochK, stochD,
    inSqueeze, squeezeStrength,
    bbUpper, bbMiddle, bbLower
  } = currentIndicators;
  
  // Common feature snapshot for all signals
  const featureSnapshot = {
    rsi: rsi14,
    macd_hist: macdHist,
    macd_line: macdLine,
    macd_signal: macdSignal,
    ema9, ema20, ema50, ema200,
    adx: adx14,
    plus_di: plusDI,
    minus_di: minusDI,
    stoch_k: stochK,
    stoch_d: stochD,
    bb_upper: bbUpper,
    bb_middle: bbMiddle,
    bb_lower: bbLower,
    in_squeeze: inSqueeze,
    squeeze_strength: squeezeStrength,
    price: currentPrice
  };
  
  // 1. SQUEEZE RELEASE - High-value signal
  if (prevIndicators.inSqueeze && !inSqueeze && macdHist != null) {
    const direction = macdHist > 0 ? 'bullish' : 'bearish';
    let score = 60; // Base score for squeeze release
    
    // Add confluence
    if (adx14 && adx14 > 20) score += 10;
    if (direction === 'bullish' && rsi14 && rsi14 > 50 && rsi14 < 70) score += 10;
    if (direction === 'bearish' && rsi14 && rsi14 < 50 && rsi14 > 30) score += 10;
    if (squeezeStrength && squeezeStrength >= 3) score += 10;
    
    signals.push({
      signalType: 'squeeze',
      direction,
      score: Math.min(100, score),
      features: { ...featureSnapshot, squeeze_release: true }
    });
  }
  
  // 2. MACD CROSS - Histogram flip
  if (prevIndicators.macdHist != null && macdHist != null) {
    const wasPositive = prevIndicators.macdHist > 0;
    const isPositive = macdHist > 0;
    
    if (!wasPositive && isPositive) {
      // Bullish cross
      let score = 55;
      if (rsi14 && rsi14 > 40 && rsi14 < 65) score += 10;
      if (adx14 && adx14 > 20) score += 10;
      if (currentPrice > ema20) score += 5;
      if (currentPrice > ema50) score += 5;
      
      signals.push({
        signalType: 'macd_cross',
        direction: 'bullish',
        score: Math.min(100, score),
        features: { ...featureSnapshot, macd_cross: 'bullish' }
      });
    } else if (wasPositive && !isPositive) {
      // Bearish cross
      let score = 55;
      if (rsi14 && rsi14 < 60 && rsi14 > 35) score += 10;
      if (adx14 && adx14 > 20) score += 10;
      if (currentPrice < ema20) score += 5;
      if (currentPrice < ema50) score += 5;
      
      signals.push({
        signalType: 'macd_cross',
        direction: 'bearish',
        score: Math.min(100, score),
        features: { ...featureSnapshot, macd_cross: 'bearish' }
      });
    }
  }
  
  // 3. RSI OVERSOLD BOUNCE
  if (prevIndicators.rsi14 != null && rsi14 != null) {
    if (prevIndicators.rsi14 < 30 && rsi14 >= 30) {
      let score = 50;
      if (stochK && stochK > stochD) score += 10;
      if (macdHist && macdHist > prevIndicators.macdHist) score += 10;
      if (currentPrice > bbLower) score += 5;
      
      signals.push({
        signalType: 'rsi_bounce',
        direction: 'bullish',
        score: Math.min(100, score),
        features: { ...featureSnapshot, rsi_bounce: 'oversold' }
      });
    }
    
    // RSI OVERBOUGHT REJECTION
    if (prevIndicators.rsi14 > 70 && rsi14 <= 70) {
      let score = 50;
      if (stochK && stochK < stochD) score += 10;
      if (macdHist && macdHist < prevIndicators.macdHist) score += 10;
      if (currentPrice < bbUpper) score += 5;
      
      signals.push({
        signalType: 'rsi_bounce',
        direction: 'bearish',
        score: Math.min(100, score),
        features: { ...featureSnapshot, rsi_bounce: 'overbought' }
      });
    }
  }
  
  // 4. MOMENTUM CONFLUENCE - Strong trending setup
  if (rsi14 != null && macdHist != null && adx14 != null) {
    // Bullish momentum
    if (
      rsi14 > 50 && rsi14 < 70 &&
      macdHist > 0 &&
      adx14 > 25 &&
      plusDI > minusDI &&
      currentPrice > ema20 &&
      currentPrice > ema50
    ) {
      const score = 65 + 
        (rsi14 > 55 ? 5 : 0) + 
        (adx14 > 30 ? 10 : 0) +
        (currentPrice > ema200 ? 10 : 0);
      
      signals.push({
        signalType: 'momentum',
        direction: 'bullish',
        score: Math.min(100, score),
        features: { ...featureSnapshot, momentum_confluence: true }
      });
    }
    
    // Bearish momentum
    if (
      rsi14 < 50 && rsi14 > 30 &&
      macdHist < 0 &&
      adx14 > 25 &&
      minusDI > plusDI &&
      currentPrice < ema20 &&
      currentPrice < ema50
    ) {
      const score = 65 + 
        (rsi14 < 45 ? 5 : 0) + 
        (adx14 > 30 ? 10 : 0) +
        (currentPrice < ema200 ? 10 : 0);
      
      signals.push({
        signalType: 'momentum',
        direction: 'bearish',
        score: Math.min(100, score),
        features: { ...featureSnapshot, momentum_confluence: true }
      });
    }
  }
  
  // Update previous indicators
  previousIndicators.set(symbol, { ...currentIndicators });
  
  return signals;
}

/**
 * Record detected signals via unified Signal Service
 * Uses batch insert with automatic deduplication
 */
async function recordSignals(
  symbol: string,
  signals: DetectedSignal[],
  price: number,
  timeframe: string = 'daily'
): Promise<number> {
  if (signals.length === 0) return 0;
  
  // Convert worker signals to SignalService format
  const signalInputs = signals.map(sig => ({
    symbol: symbol.toUpperCase(),
    signalType: sig.signalType,
    direction: sig.direction as 'bullish' | 'bearish',
    score: sig.score,
    priceAtSignal: price,
    timeframe,
    features: sig.features,
    source: 'background_worker' as const
  }));
  
  const { recorded, duplicates } = await recordSignalsBatch(signalInputs);
  
  if (duplicates > 0) {
    console.log(`[worker] ${symbol}: ${recorded} new signals, ${duplicates} duplicates skipped`);
  }
  
  return recorded;
}

// ============================================================================
// Main Processing Functions
// ============================================================================

async function processEquitySymbol(symbol: string): Promise<{ apiCalls: number; success: boolean }> {
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
      const ohlcvBars: OHLCVBar[] = bars.map(b => ({
        timestamp: b.timestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
      }));

      const indicators = calculateAllIndicators(ohlcvBars);
      const squeeze = detectSqueeze(ohlcvBars);
      const warmup = getIndicatorWarmupStatus(ohlcvBars.length, 'daily');
      
      const fullIndicators = {
        ...indicators,
        inSqueeze: squeeze?.inSqueeze ?? false,
        squeezeStrength: squeeze?.squeezeStrength ?? 0,
        warmup,
      };

      await upsertIndicators(symbol, 'daily', fullIndicators);
      await cacheIndicators(symbol, 'daily', fullIndicators);
      
      // 4. Detect and record signals (runs on full universe automatically)
      const latestPrice = bars[bars.length - 1]?.close;
      if (latestPrice && warmup.coreReady) {
        const detectedSignals = detectSignals(symbol, fullIndicators, latestPrice);
        if (detectedSignals.length > 0) {
          const recorded = await recordSignals(symbol, detectedSignals, latestPrice, 'daily');
          if (recorded > 0) {
            console.log(`[worker] ${symbol}: Recorded ${recorded} signal(s): ${detectedSignals.map(s => `${s.signalType}:${s.direction}`).join(', ')}`);
          }
        }
      } else if (latestPrice) {
        console.log(`[worker] ${symbol}: Skipping signals, warmup incomplete (${warmup.missingIndicators.join(', ')})`);
      }
    }

    await markSymbolFetched(symbol, true);
    return { apiCalls, success: true };

  } catch (err: any) {
    console.error(`[worker] Error processing ${symbol}:`, err?.message || err);
    await markSymbolFetched(symbol, false);
    return { apiCalls, success: false };
  }
}

async function processCryptoSymbol(symbol: string): Promise<{
  apiCalls: number;
  success: boolean;
  coingeckoAttempted: number;
  coingeckoSucceeded: number;
  coingeckoNoData: number;
  coingeckoFailed: number;
}> {
  let apiCalls = 0;
  const coingeckoAttempted = 1;
  
  try {
    // CoinGecko only for crypto ingestion
    let bars = await fetchCoinGeckoDaily(symbol);
    let coingeckoSucceeded = 0;
    let coingeckoNoData = 0;

    if (bars.length === 0) {
      coingeckoNoData = 1;
      console.log(`[worker] CoinGecko unavailable/no mapping for ${symbol}; skipping crypto fallback source`);
      await markSymbolNoData(symbol);
      return {
        apiCalls,
        success: false,
        coingeckoAttempted,
        coingeckoSucceeded,
        coingeckoNoData,
        coingeckoFailed: 0,
      };
    }

    coingeckoSucceeded = 1;

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
      const ohlcvBars: OHLCVBar[] = bars.map(b => ({
        timestamp: b.timestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
      }));

      const indicators = calculateAllIndicators(ohlcvBars);
      const squeeze = detectSqueeze(ohlcvBars);
      const warmup = getIndicatorWarmupStatus(ohlcvBars.length, 'daily');
      
      const fullIndicators = {
        ...indicators,
        inSqueeze: squeeze?.inSqueeze ?? false,
        squeezeStrength: squeeze?.squeezeStrength ?? 0,
        warmup,
      };

      await upsertIndicators(symbol, 'daily', fullIndicators);
      await cacheIndicators(symbol, 'daily', fullIndicators);
      
      // Detect and record signals (runs on full universe automatically)
      if (warmup.coreReady) {
        const detectedSignals = detectSignals(symbol, fullIndicators, latest.close);
        if (detectedSignals.length > 0) {
          const recorded = await recordSignals(symbol, detectedSignals, latest.close, 'daily');
          if (recorded > 0) {
            console.log(`[worker] ${symbol}: Recorded ${recorded} signal(s): ${detectedSignals.map(s => `${s.signalType}:${s.direction}`).join(', ')}`);
          }
        }
      } else {
        console.log(`[worker] ${symbol}: Skipping signals, warmup incomplete (${warmup.missingIndicators.join(', ')})`);
      }
    }

    await markSymbolFetched(symbol, true);
    return {
      apiCalls,
      success: true,
      coingeckoAttempted,
      coingeckoSucceeded,
      coingeckoNoData,
      coingeckoFailed: 0,
    };

  } catch (err: any) {
    console.error(`[worker] Error processing crypto ${symbol}:`, err?.message || err);
    await markSymbolFetched(symbol, false);
    return {
      apiCalls,
      success: false,
      coingeckoAttempted,
      coingeckoSucceeded: 0,
      coingeckoNoData: 0,
      coingeckoFailed: 1,
    };
  }
}

// ============================================================================
// Main Worker Loop
// ============================================================================

async function runIngestionCycle(
  includeForex = false,
  cryptoOnly = false,
  equitiesOnly = false
): Promise<{
  symbolsProcessed: number;
  symbolsDue: number;
  apiCalls: number;
  errors: number;
  skippedNotDue: number;
  skippedEquityOffhours: number;
  coingeckoAttempted: number;
  coingeckoSucceeded: number;
  coingeckoNoData: number;
  coingeckoFailed: number;
}> {
  const stats = {
    symbolsProcessed: 0,
    symbolsDue: 0,
    apiCalls: 0,
    errors: 0,
    skippedNotDue: 0,
    skippedEquityOffhours: 0,
    coingeckoAttempted: 0,
    coingeckoSucceeded: 0,
    coingeckoNoData: 0,
    coingeckoFailed: 0,
  };
  const sessionState = getUsMarketSessionState();
  const equitySessionState = getUsEquitySessionState();
  const runEquityOffhoursScan =
    equitySessionState.mode === 'premarket'
      ? isScanSlotMatch(equitySessionState.minuteOfDay, equitySessionState.premarketScanSlots, equitySessionState.slotToleranceMinutes)
      : equitySessionState.mode === 'postmarket'
        ? isScanSlotMatch(equitySessionState.minuteOfDay, equitySessionState.postmarketScanSlots, equitySessionState.slotToleranceMinutes)
        : false;
  
  const allSymbols = await getSymbolsToFetch(undefined, { includeForex });
  const symbols = cryptoOnly
    ? allSymbols.filter((s) => s.asset_type === 'crypto')
    : equitiesOnly
      ? allSymbols.filter((s) => s.asset_type !== 'crypto')
      : allSymbols;
  console.log(`[worker] Processing ${symbols.length} symbols... (crypto cadence mode: ${sessionState.mode}, equity session: ${equitySessionState.mode}${runEquityOffhoursScan ? ', off-hours scan slot=active' : ''})`);

  for (const { symbol, tier, asset_type, last_fetched_at } of symbols) {
    try {
      if (asset_type !== 'crypto' && equitySessionState.mode !== 'market' && !runEquityOffhoursScan) {
        stats.skippedEquityOffhours++;
        continue;
      }

      const intervalSeconds = getTierRefreshIntervalSeconds(asset_type, tier, sessionState.mode);
      const bypassDueCheck = asset_type !== 'crypto' && equitySessionState.mode !== 'market' && runEquityOffhoursScan;
      if (!bypassDueCheck && !isDueForFetch(last_fetched_at, intervalSeconds)) {
        stats.skippedNotDue++;
        continue;
      }

      stats.symbolsDue++;

      let result: {
        apiCalls: number;
        success: boolean;
        coingeckoAttempted?: number;
        coingeckoSucceeded?: number;
        coingeckoNoData?: number;
        coingeckoFailed?: number;
      };

      if (asset_type === 'crypto') {
        result = await processCryptoSymbol(symbol);
      } else {
        result = await processEquitySymbol(symbol);
      }

      stats.apiCalls += result.apiCalls;
      stats.coingeckoAttempted += result.coingeckoAttempted || 0;
      stats.coingeckoSucceeded += result.coingeckoSucceeded || 0;
      stats.coingeckoNoData += result.coingeckoNoData || 0;
      stats.coingeckoFailed += result.coingeckoFailed || 0;
      stats.symbolsProcessed++;
      
      if (!result.success) {
        stats.errors++;
      }

      console.log(`[worker] Processed ${symbol} (${asset_type}, tier ${tier}) - ${result.success ? 'OK' : 'FAIL'}`);

      // Small delay between symbols to be nice to the API
      await sleep(100);

    } catch (err: any) {
      console.error(`[worker] Fatal error for ${symbol}:`, err?.message || err);
      stats.errors++;
    }
  }

  return stats;
}

async function main(): Promise<void> {
  console.log('[worker] MSP Data Ingestion Worker starting...');

  const cliOnce = process.argv.includes('--once');
  const cliIncludeForex = process.argv.includes('--include-forex');
  const cliCryptoOnly = process.argv.includes('--crypto-only');
  const cliEquitiesOnly = process.argv.includes('--equities-only');
  const envOnce = ['1', 'true', 'yes'].includes((getEnv('WORKER_RUN_ONCE') || '').toLowerCase());
  const envIncludeForex = ['1', 'true', 'yes'].includes((getEnv('WORKER_INCLUDE_FOREX') || '').toLowerCase());
  const envCryptoOnly = ['1', 'true', 'yes'].includes((getEnv('WORKER_CRYPTO_ONLY') || '').toLowerCase());
  const envEquitiesOnly = ['1', 'true', 'yes'].includes((getEnv('WORKER_EQUITIES_ONLY') || '').toLowerCase());
  const runOnce = cliOnce || envOnce;
  const includeForex = cliIncludeForex || envIncludeForex;
  const cryptoOnly = cliCryptoOnly || envCryptoOnly;
  const equitiesOnly = cliEquitiesOnly || envEquitiesOnly;
  const failOnErrors = ['1', 'true', 'yes'].includes((getEnv('WORKER_FAIL_ON_ERRORS') || '').toLowerCase());
  const workerLane = cryptoOnly ? 'crypto' : equitiesOnly ? 'equities' : 'mixed';

  if (cryptoOnly && equitiesOnly) {
    console.error('[worker] Cannot enable both --crypto-only and --equities-only');
    process.exit(1);
  }
  
  if (!cryptoOnly && !getEnv('ALPHA_VANTAGE_API_KEY')) {
    console.error('[worker] ALPHA_VANTAGE_API_KEY not set');
    process.exit(1);
  }

  if (!getEnv('DATABASE_URL')) {
    console.error('[worker] DATABASE_URL not set');
    process.exit(1);
  }

  const rpm = parseInt(getEnv('ALPHA_VANTAGE_RPM') || '70', 10);
  const burstPerSecond = parseInt(getEnv('ALPHA_VANTAGE_BURST_PER_SECOND') || '4', 10);
  console.log(`[worker] Rate limit: ${rpm} requests/minute`);
  console.log(`[worker] Burst cap: ${burstPerSecond} requests/second`);
  console.log(`[worker] Redis: ${getEnv('UPSTASH_REDIS_REST_URL') ? 'enabled' : 'disabled'}`);
  console.log(`[worker] Mode: ${runOnce ? 'one-cycle' : 'continuous'}`);
  console.log(`[worker] Forex ingest: ${includeForex ? 'enabled (manual override)' : 'disabled (equities + crypto only)'}`);
  console.log(`[worker] Crypto-only mode: ${cryptoOnly ? 'enabled (CoinGecko-only ingest)' : 'disabled'}`);
  console.log(`[worker] Equities-only mode: ${equitiesOnly ? 'enabled (Alpha Vantage-only ingest)' : 'disabled'}`);
  console.log(`[worker] Lane lock: ${workerLane}`);
  console.log(`[worker] CoinGecko dynamic resolve: ${getBoolFromEnv('WORKER_CG_RESOLVE_UNMAPPED', false) ? 'enabled' : 'disabled (mapped symbols only)'}`);
  console.log(`[worker] CoinGecko OHLC request profile: retries=${getPositiveIntFromEnv('WORKER_CG_OHLC_RETRIES', 1)}, timeoutMs=${getPositiveIntFromEnv('WORKER_CG_OHLC_TIMEOUT_MS', 6000)}`);
  const sessionState = getUsMarketSessionState();
  console.log(`[worker] Market session timezone: ${sessionState.timezone}`);
  console.log(`[worker] Market cadence (T1/T2/T3): ${getTierRefreshIntervalSeconds('crypto', 1, 'market')}s / ${getTierRefreshIntervalSeconds('crypto', 2, 'market')}s / ${getTierRefreshIntervalSeconds('crypto', 3, 'market')}s`);
  console.log(`[worker] Off-hours cadence (T1/T2/T3): ${getTierRefreshIntervalSeconds('crypto', 1, 'offhours')}s / ${getTierRefreshIntervalSeconds('crypto', 2, 'offhours')}s / ${getTierRefreshIntervalSeconds('crypto', 3, 'offhours')}s`);

  await ensureIngestionSchema();
  console.log('[worker] Schema compatibility checks complete');

  const releaseLaneLock = await acquireWorkerLaneLock(workerLane);
  if (!releaseLaneLock) {
    console.log(`[worker] Another ${workerLane} ingest worker is already running; exiting`);
    process.exit(0);
  }

  process.on('SIGINT', () => {
    void releaseLaneLock();
  });

  process.on('SIGTERM', () => {
    void releaseLaneLock();
  });

  let cycleCount = 0;
  const CYCLE_INTERVAL_MS = 60000; // Run full cycle every 60 seconds

  while (true) {
    cycleCount++;
    console.log(`\n[worker] === Cycle ${cycleCount} starting ===`);
    const startTime = Date.now();

    try {
      const stats = await runIngestionCycle(includeForex, cryptoOnly, equitiesOnly);
      const duration = Math.round((Date.now() - startTime) / 1000);

      console.log(`[worker] Cycle ${cycleCount} completed in ${duration}s`);
      console.log(`[worker] Stats: due=${stats.symbolsDue}, processed=${stats.symbolsProcessed}, ${stats.apiCalls} API calls, ${stats.errors} errors, ${stats.skippedNotDue || 0} skipped (not due), ${stats.skippedEquityOffhours || 0} skipped (equity off-hours)`);
      console.log(`[worker] CoinGecko stats: attempted=${stats.coingeckoAttempted}, succeeded=${stats.coingeckoSucceeded}, noData=${stats.coingeckoNoData}, failed=${stats.coingeckoFailed}`);

      await logWorkerRun(`ingest-${workerLane}`, stats, 'completed');

      if (runOnce) {
        if (failOnErrors && stats.errors > 0) {
          console.error(`[worker] One-cycle mode completed with ${stats.errors} errors (WORKER_FAIL_ON_ERRORS enabled)`);
          process.exit(1);
        }
        console.log('[worker] One-cycle mode complete, exiting');
        process.exit(0);
      }

    } catch (err: any) {
      console.error(`[worker] Cycle ${cycleCount} failed:`, err?.message || err);
      await logWorkerRun(`ingest-${workerLane}`, {}, 'failed', err?.message || String(err));

      if (runOnce) {
        process.exit(1);
      }
    }

    // Wait for next cycle
    const elapsed = Date.now() - startTime;
    const waitTime = Math.max(0, CYCLE_INTERVAL_MS - elapsed);
    console.log(`[worker] Waiting ${Math.round(waitTime / 1000)}s until next cycle...`);
    await sleep(waitTime);
  }
}

// Run if executed directly
main().catch((err) => {
  console.error('[worker] Fatal error:', err);
  process.exit(1);
});
