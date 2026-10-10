/**
 * Genuine-timeframe crypto bars for the scanner (CoinGecko Pro).
 *
 * Sources (verified live 2026-09-20 against pro-api.coingecko.com):
 *  - /coins/{id}/ohlc/range?interval=daily  → true DAILY OHLC, ≤180 days per call (we take 2 calls → ~360 bars;
 *                                              callers that need a converged EMA200 ask for more 180-day windows).
 *  - /coins/{id}/ohlc/range?interval=hourly → true HOURLY OHLC, ≤31 days per call (~745 bars).
 *  - /coins/{id}/market_chart/range          → daily `total_volumes` (24h volume ending at each 00:00 UTC point) for
 *                                              >90-day ranges; 5-minute price points for ≤1-day ranges.
 * Nothing is relabelled: '1h' rows are hourly bars, 'daily' rows are daily bars, 'weekly' rows are Monday-anchored
 * aggregates of completed daily bars, '15m' rows are aggregated 5-minute price samples (approximate high/low — labelled).
 *
 * Partial-bar policy: the still-open bar is EXCLUDED from indicator inputs and returned as `partialBar` (used for the
 * current price). Indicators therefore describe the last COMPLETED bar. This is deliberate and surfaced in data trust.
 *
 * The daily partial bar is not that UTC day's exchange OHLC. Its open is the previous completed close. Its high, low,
 * and volume are the rolling 24h figures from /coins/markets (high_24h, low_24h, total_volume).
 */
import { getMarketData, getOHLC, getOHLCRange, getMarketChartRange, resolveSymbolToId } from '@/lib/coingecko';
import { aggregateBars, attachDailyVolumes, barsFromPriceSamples, splitPartialBar, INTERVAL_MS, type Bar, type ScanBarInterval } from './barAggregation';

export type CryptoScanTimeframe = '15m' | '30m' | '1h' | 'daily' | 'weekly';

export interface CryptoSeries {
  coinId: string;
  timeframe: CryptoScanTimeframe;
  /** The interval the bars really are. */
  barInterval: ScanBarInterval;
  /** Completed bars only, ascending. */
  bars: Bar[];
  partialBar: Bar | null;
  lastCompletedBarAt: string | null;
  /** Latest trade-ish price: partial bar close when available, else last completed close. */
  currentPrice: number | null;
  /** ISO time of the price observation. Null when no time was recorded. */
  priceAsOf: string | null;
  /** The observation is past the open-quote max age, or the price is yesterday's completed close. */
  priceStale: boolean;
  /** Evidence label: "as of <ISO>" or "yesterday's close, as of <ISO>". */
  priceLabel: string;
  hlBasis: 'exchange_ohlc' | 'price_samples';
  volumeBasis: 'coingecko_daily_total_volume' | 'unavailable';
  source: string;
  warnings: string[];
}

const DAY_S = 86_400;
const HOURLY_MAX_DAYS = 31;
const DAILY_MAX_DAYS = 180;
/** Default daily history: 2 × 180-day windows (~360 bars). User-facing callers keep this cost. */
export const DEFAULT_DAILY_WINDOWS = 2;
/** Upper bound on 180-day windows per request (8 → ~1,440 bars). */
const MAX_DAILY_WINDOWS = 8;

// CoinGecko OHLC timestamps are candle CLOSE times; Bar.t is the OPEN time.
// Normalise before volume joins, weekly aggregation, or completed-bar checks.
const asBars = (rows: number[][] | null, interval: Exclude<ScanBarInterval, '1w'>): Bar[] =>
  (rows ?? [])
    .filter((r) => Array.isArray(r) && r.length >= 5 && Number.isFinite(r[0]) && r[0] > INTERVAL_MS[interval] &&
      r.slice(1, 5).every((v) => typeof v === 'number' && Number.isFinite(v) && v > 0) &&
      r[2] >= Math.max(r[1], r[3], r[4]) && r[3] <= Math.min(r[1], r[2], r[4]))
    .map((r) => ({ t: new Date(r[0] - INTERVAL_MS[interval]).toISOString(), open: r[1], high: r[2], low: r[3], close: r[4], volume: null }));

const dedupeByTime = (bars: Bar[]): Bar[] => {
  const m = new Map<string, Bar>();
  for (const b of bars) m.set(b.t, b);
  return [...m.values()].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
};

type RequestOptions = { retries?: number; timeoutMs?: number };

/** Completed UTC days never change. 24h in Redis and in this process, keyed by the day boundary. */
const COMPLETED_DAY_CACHE_S = 86_400;
const COMPLETED_MEMORY_MAX = 400;
/** market_chart/range returns one 00:00 UTC point per day only for ranges longer than 90 days. */
const DAILY_VOLUME_RANGE_DAYS = 92;

/**
 * Bar-boundary request ends, so the same URL repeats and the fetch cache can hit.
 *  - `liveEndS`: the live end of a series, floored to the minute (still ≥ 60 s behind now: CoinGecko rejects a `to`
 *    even a few seconds ahead of its own clock, error 10014). The open bar stays in the response, just ≤ 2 min old.
 *    (Not floored in the minute right after 00:00 UTC, so the new day's open candle is never cut off.)
 *  - `dayStartS`: 00:00 UTC of the day `liveEndS` falls in. Windows ending there hold completed daily bars only, so
 *    their URL is identical for the whole UTC day.
 */
export function cryptoRequestAnchors(nowMs: number): { liveEndS: number; dayStartS: number } {
  const trailingS = Math.floor(nowMs / 1000) - 60;
  const floored = Math.floor(trailingS / 60) * 60;
  // Never end exactly on 00:00 UTC in the minute after midnight: that would drop the new day's open candle.
  const liveEndS = floored % DAY_S === 0 ? trailingS : floored;
  return { liveEndS, dayStartS: Math.floor(liveEndS / DAY_S) * DAY_S };
}

type CompletedDaily = { bars: Bar[]; volumes: Array<[number, number]>; warnings: string[]; windows: number };
type OpenQuote = { price: number; high: number; low: number; volume: number | null };
type MarketQuoteRow = { id?: string; current_price?: number | null; high_24h?: number | null; low_24h?: number | null; total_volume?: number | null };

const completedMemory = new Map<string, { freshUntil: number; value: CompletedDaily }>();
const openMemory = new Map<string, { minute: number; asOfMs: number; quote: OpenQuote }>();
/** One Redis blob for the latest bulk /coins/markets snapshot. Pages read it; they do not refetch it. */
const OPEN_QUOTE_REDIS_KEY = 'cg:crypto-open:v1';
const MARKETS_IDS_PER_CALL = 250;
/** In-process open quotes older than this are re-read from Redis. About two minutes. */
const OPEN_QUOTE_MEMORY_MS = 120_000;
/** Past this age an open quote is still returned, with stale:true. It is not treated as current. */
const OPEN_QUOTE_MAX_AGE_MS = 15 * 60_000;
/** A failed older window (~180 bars) must not sit for a day, or EMA200 cannot recover. */
const DEGRADED_HISTORY_TTL_S = 20 * 60;
const HISTORY_LOCK_S = 20;

type SharedOpen = { quote: OpenQuote; asOfMs: number; stale: boolean };
type OpenBatch = {
  minute: number;
  asOfMs: number;
  ids: Set<string>;
  waiters: Map<string, Array<(quote: SharedOpen | null) => void>>;
  scheduled: boolean;
};
let openBatch: OpenBatch | null = null;
const historyInflight = new Map<string, { windows: number; promise: Promise<CompletedDaily> }>();

function openQuoteMemoryMs(): number {
  const n = Number(process.env.CG_OPEN_QUOTE_MEMORY_MS);
  return Number.isFinite(n) && n >= 0 ? n : OPEN_QUOTE_MEMORY_MS;
}

function openQuoteMaxAgeMs(): number {
  const n = Number(process.env.CG_OPEN_QUOTE_MAX_AGE_MS);
  return Number.isFinite(n) && n > 0 ? n : OPEN_QUOTE_MAX_AGE_MS;
}

function degradedHistoryTtlS(): number {
  const n = Number(process.env.CG_DEGRADED_HISTORY_TTL_S);
  if (Number.isFinite(n) && n >= 15 * 60 && n <= 30 * 60) return Math.floor(n);
  return DEGRADED_HISTORY_TTL_S;
}

function historyIsDegraded(value: CompletedDaily): boolean {
  return value.warnings.some((warning) => /older history missing|warm-up history shorter/.test(warning));
}

function completedKey(coinId: string, dayStartS: number): string {
  return `cg:crypto-daily:v1:${coinId}:${dayStartS}`;
}

function sliceCompleted(value: CompletedDaily, dayStartS: number, windows: number): CompletedDaily {
  const oldest = (dayStartS - windows * DAILY_MAX_DAYS * DAY_S) * 1000;
  return {
    bars: value.bars.filter((bar) => Date.parse(bar.t) >= oldest),
    volumes: value.volumes.filter(([t]) => t >= oldest),
    warnings: value.warnings,
    windows,
  };
}

function redisConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function redisCmd() {
  if (!redisConfigured()) return null;
  try {
    const { getRedis } = await import('@/lib/redis');
    return getRedis();
  } catch {
    return null;
  }
}

function rememberCompleted(key: string, value: CompletedDaily, nowMs: number): void {
  const existing = completedMemory.get(key);
  if (existing && existing.freshUntil > nowMs && existing.value.windows > value.windows) return;
  if (completedMemory.size >= COMPLETED_MEMORY_MAX && !completedMemory.has(key)) {
    const oldest = completedMemory.keys().next().value;
    if (oldest) completedMemory.delete(oldest);
  }
  const ttlS = historyIsDegraded(value) ? degradedHistoryTtlS() : COMPLETED_DAY_CACHE_S;
  const freshUntil = nowMs + ttlS * 1000;
  completedMemory.set(key, { freshUntil, value });
  if (!redisConfigured()) return;
  void redisCmd().then((redis) => redis?.set(key, { freshUntil, value }, { ex: ttlS })).catch(() => undefined);
}

async function readCompleted(key: string, nowMs: number): Promise<CompletedDaily | null> {
  const local = completedMemory.get(key);
  if (local && local.freshUntil > nowMs) return local.value;
  if (local) completedMemory.delete(key);
  if (!redisConfigured()) return null;
  try {
    const cached = await (await redisCmd())?.get(key) as { freshUntil: number; value: CompletedDaily } | null | undefined;
    if (cached && cached.freshUntil > nowMs && Array.isArray(cached.value?.bars) && (cached.value.windows ?? 0) > 0) {
      completedMemory.set(key, { freshUntil: cached.freshUntil, value: cached.value });
      return cached.value;
    }
  } catch { /* a cache miss falls through to CoinGecko */ }
  return null;
}

/** Widest stored history for this UTC day. A narrower caller slices it and does not refetch. */
async function readSharedCompleted(coinId: string, dayStartS: number, windows: number, nowMs: number): Promise<CompletedDaily | null> {
  const cached = await readCompleted(completedKey(coinId, dayStartS), nowMs);
  if (!cached || cached.windows < windows) return null;
  return sliceCompleted(cached, dayStartS, windows);
}

function quoteFromMarketRow(row: MarketQuoteRow | null | undefined): OpenQuote | null {
  const price = Number(row?.current_price);
  if (!row?.id || !Number.isFinite(price) || price <= 0) return null;
  return {
    price,
    high: Number(row.high_24h) > 0 ? Number(row.high_24h) : price,
    low: Number(row.low_24h) > 0 ? Number(row.low_24h) : price,
    volume: row.total_volume == null || !Number.isFinite(Number(row.total_volume)) ? null : Number(row.total_volume),
  };
}

/**
 * The worker's bulk /coins/markets snapshot. Writes the shared open-day book.
 * A page that already has completed bars reads this book and does not call CoinGecko.
 */
function describeOpen(entry: { asOfMs: number; quote: OpenQuote }, nowMs: number): SharedOpen {
  return { quote: entry.quote, asOfMs: entry.asOfMs, stale: nowMs - entry.asOfMs > openQuoteMaxAgeMs() };
}

export async function publishSharedOpenQuotes(rows: MarketQuoteRow[] | null, nowMs = Date.now()): Promise<void> {
  const minute = Math.floor(nowMs / 60_000);
  for (const row of Array.isArray(rows) ? rows : []) {
    const quote = quoteFromMarketRow(row);
    if (quote && row.id) openMemory.set(row.id, { minute, asOfMs: nowMs, quote });
  }
  if (!redisConfigured()) return;
  const quotes: Record<string, OpenQuote & { asOfMs: number }> = {};
  for (const [id, entry] of openMemory) quotes[id] = { ...entry.quote, asOfMs: entry.asOfMs };
  try {
    await (await redisCmd())?.set(OPEN_QUOTE_REDIS_KEY, { minute, asOfMs: nowMs, quotes }, { ex: COMPLETED_DAY_CACHE_S });
  } catch { /* the in-process book still serves this process */ }
}

async function refreshOpenBookFromRedis(): Promise<void> {
  const blob = await (await redisCmd())?.get(OPEN_QUOTE_REDIS_KEY) as {
    minute?: number;
    asOfMs?: number;
    quotes?: Record<string, OpenQuote & { asOfMs?: number }>;
  } | null | undefined;
  const bookAsOf = typeof blob?.asOfMs === 'number' ? blob.asOfMs : (typeof blob?.minute === 'number' ? blob.minute * 60_000 : 0);
  const minute = typeof blob?.minute === 'number' ? blob.minute : Math.floor(bookAsOf / 60_000);
  for (const [id, quote] of Object.entries(blob?.quotes ?? {})) {
    if (!quote || typeof quote.price !== 'number' || !(quote.price > 0)) continue;
    const asOfMs = typeof quote.asOfMs === 'number' ? quote.asOfMs : bookAsOf;
    const local = openMemory.get(id);
    if (local && local.asOfMs >= asOfMs) continue;
    openMemory.set(id, {
      minute,
      asOfMs,
      quote: {
        price: quote.price,
        high: Number(quote.high) > 0 ? Number(quote.high) : quote.price,
        low: Number(quote.low) > 0 ? Number(quote.low) : quote.price,
        volume: quote.volume == null || !Number.isFinite(Number(quote.volume)) ? null : Number(quote.volume),
      },
    });
  }
}

/**
 * Last published open quote. Never calls CoinGecko.
 * Memory younger than about two minutes is used as-is. Older memory is re-read from Redis.
 * Past the max age the quote is still returned, with asOf and stale:true, so a page does not wait.
 */
async function readSharedOpenQuote(coinId: string, nowMs: number): Promise<SharedOpen | null> {
  const local = openMemory.get(coinId);
  if (local && nowMs - local.asOfMs <= openQuoteMemoryMs()) return describeOpen(local, nowMs);
  if (redisConfigured()) {
    try { await refreshOpenBookFromRedis(); } catch { /* keep the copy this process already has */ }
  }
  const entry = openMemory.get(coinId);
  return entry ? describeOpen(entry, nowMs) : null;
}

function requestOpenQuote(coinId: string, nowMs: number): Promise<SharedOpen | null> {
  const minute = Math.floor(nowMs / 60_000);
  const hit = openMemory.get(coinId);
  if (hit && hit.minute === minute) return Promise.resolve(describeOpen(hit, nowMs));
  if (!openBatch || openBatch.minute !== minute) openBatch = { minute, asOfMs: nowMs, ids: new Set(), waiters: new Map(), scheduled: false };
  openBatch.ids.add(coinId);
  const batch = openBatch;
  const promise = new Promise<SharedOpen | null>((resolve) => {
    const list = batch.waiters.get(coinId) ?? [];
    list.push(resolve);
    batch.waiters.set(coinId, list);
  });
  if (!batch.scheduled) {
    batch.scheduled = true;
    queueMicrotask(() => { void flushOpenQuotes(batch); });
  }
  return promise;
}

async function flushOpenQuotes(batch: OpenBatch): Promise<void> {
  if (openBatch === batch) openBatch = null;
  const ids = [...batch.ids];
  let rows: Awaited<ReturnType<typeof getMarketData>> = null;
  try {
    if (typeof getMarketData === 'function' && ids.length) {
      rows = await getMarketData({
        ids,
        per_page: Math.min(250, Math.max(ids.length, 1)),
        page: 1,
        sparkline: false,
        precision: 'full',
      }, { retries: 0, timeoutMs: 8_000 });
    }
  } catch { rows = null; }
  const list = Array.isArray(rows) ? rows : [];
  const byId = new Map(list.filter((row) => row?.id).map((row) => [row.id, row]));
  for (const id of ids) {
    const quote = quoteFromMarketRow(byId.get(id));
    const shared = quote ? { quote, asOfMs: batch.asOfMs, stale: false } : null;
    if (quote) openMemory.set(id, { minute: batch.minute, asOfMs: batch.asOfMs, quote });
    for (const resolve of batch.waiters.get(id) ?? []) resolve(shared);
  }
}

/**
 * Ahead-of-time fill for the shared daily cache. One /coins/markets call covers every coin's open day.
 * History is fetched only for coins that are not already stored. Page reads do not call this.
 */
export async function warmSharedCryptoSeries(
  coins: Array<{ coinId: string }>,
  nowMs = Date.now(),
  opts?: { dailyWindows?: number },
): Promise<{ fromCache: number; historyCoins: number; marketsCalls: number }> {
  const windows = Math.min(MAX_DAILY_WINDOWS, Math.max(2, Math.floor(opts?.dailyWindows ?? DEFAULT_DAILY_WINDOWS)));
  const { dayStartS } = cryptoRequestAnchors(nowMs);
  const ids = [...new Set(coins.map((coin) => coin.coinId).filter(Boolean))];
  const missing: string[] = [];
  for (const id of ids) {
    if (!(await readSharedCompleted(id, dayStartS, windows, nowMs))) missing.push(id);
  }
  const minute = Math.floor(nowMs / 60_000);
  const quotesFresh = ids.length > 0 && ids.every((id) => openMemory.get(id)?.minute === minute);
  let marketsCalls = 0;
  if (!quotesFresh && ids.length) {
    for (let i = 0; i < ids.length; i += MARKETS_IDS_PER_CALL) {
      const chunk = ids.slice(i, i + MARKETS_IDS_PER_CALL);
      marketsCalls += 1;
      try {
        const rows = await getMarketData({
          ids: chunk,
          per_page: chunk.length,
          page: 1,
          sparkline: false,
          precision: 'full',
        }, { retries: 0, timeoutMs: 8_000 });
        await publishSharedOpenQuotes(rows, nowMs);
      } catch { /* keep the last published book */ }
    }
  }
  for (const id of missing) {
    try { await fetchDailyBars(id, nowMs, { retries: 0, timeoutMs: 8_000 }, windows); } catch { /* one coin does not stop the warm */ }
  }
  return { fromCache: ids.length - missing.length, historyCoins: missing.length, marketsCalls };
}

/**
 * Open-day bar built from the shared markets snapshot.
 * open = previous completed close (not the UTC session open).
 * high / low / volume = rolling 24h high_24h, low_24h, and total_volume.
 */
function partialFromQuote(dayStartS: number, bars: Bar[], quote: OpenQuote): Bar {
  const prev = bars[bars.length - 1]?.close ?? quote.price;
  const close = quote.price;
  return {
    t: new Date(dayStartS * 1000).toISOString(),
    open: prev,
    high: Math.max(quote.high, prev, close),
    low: Math.min(quote.low, prev, close),
    close,
    volume: quote.volume,
  };
}

/** Test hook. Completed-day and open-day caches are process-global. */
export function resetCryptoDailyCacheForTests(): void {
  completedMemory.clear();
  openMemory.clear();
  openBatch = null;
  historyInflight.clear();
}

async function pollSharedCompleted(coinId: string, dayStartS: number, windows: number, nowMs: number): Promise<CompletedDaily | null> {
  const budgetMs = HISTORY_LOCK_S * 1000;
  const started = Date.now();
  let delay = 40;
  for (;;) {
    const hit = await readSharedCompleted(coinId, dayStartS, windows, nowMs);
    if (hit) return hit;
    const left = budgetMs - (Date.now() - started);
    if (left <= 0) return null;
    await new Promise((resolve) => setTimeout(resolve, Math.min(delay, left)));
    delay = Math.min(delay * 2, 1000);
  }
}

async function fetchDailyBars(coinId: string, nowMs: number, requestOptions?: RequestOptions, windows = DEFAULT_DAILY_WINDOWS): Promise<CompletedDaily> {
  const { dayStartS } = cryptoRequestAnchors(nowMs);
  const key = completedKey(coinId, dayStartS);
  const pending = historyInflight.get(key);
  if (pending && pending.windows >= windows) return sliceCompleted(await pending.promise, dayStartS, windows);
  const run = loadDailyBars(coinId, nowMs, requestOptions, windows, key, dayStartS);
  if (!pending) historyInflight.set(key, { windows, promise: run });
  try {
    return await run;
  } finally {
    if (historyInflight.get(key)?.promise === run) historyInflight.delete(key);
  }
}

async function loadDailyBars(coinId: string, nowMs: number, requestOptions: RequestOptions | undefined, windows: number, key: string, dayStartS: number): Promise<CompletedDaily> {
  const cached = await readSharedCompleted(coinId, dayStartS, windows, nowMs);
  if (cached) return cached;
  let release: (() => Promise<void>) | null = null;
  if (redisConfigured()) {
    try {
      const redis = await redisCmd();
      const lockKey = `${key}:lock`;
      const got = await redis?.set(lockKey, '1', { nx: true, ex: HISTORY_LOCK_S });
      if (got) release = async () => { try { await redis?.del(lockKey); } catch { /* the lock expires on its own */ } };
      else if (redis) {
        const waited = await pollSharedCompleted(coinId, dayStartS, windows, nowMs);
        if (waited) return waited;
      }
    } catch { /* a lock miss still fetches, so a dead holder cannot stall the read */ }
  }
  try {
    return await fetchDailyBarsUncached(coinId, nowMs, requestOptions, windows, key, dayStartS);
  } finally {
    if (release) await release();
  }
}

async function fetchDailyBarsUncached(coinId: string, nowMs: number, requestOptions: RequestOptions | undefined, windows: number, key: string, dayStartS: number): Promise<CompletedDaily> {
  const warnings: string[] = [];
  const completedOpts = { ...requestOptions, cacheSeconds: COMPLETED_DAY_CACHE_S };
  // Every window ends on the UTC day boundary, so the URL is stable for the whole day.
  // The still-open day is not in these windows; callers fill it from one batched markets read.
  const completedWindow = (k: number) => getOHLCRange(
    coinId, dayStartS - (k + 1) * DAILY_MAX_DAYS * DAY_S + 3600, dayStartS - k * DAILY_MAX_DAYS * DAY_S, completedOpts,
  );
  const [chart, ...ohlcWindows] = await Promise.all([
    getMarketChartRange(coinId, dayStartS - 2 * DAILY_MAX_DAYS * DAY_S + 3600, dayStartS, completedOpts),
    ...Array.from({ length: windows }, (_, k) => completedWindow(k)),
  ]);
  const recent = ohlcWindows[0];
  const older = ohlcWindows[1];
  const extra = ohlcWindows.slice(2);
  if (!recent?.length) throw new Error(`CoinGecko daily OHLC unavailable for ${coinId}`);
  if (!older?.length) warnings.push('only ~180 daily bars available (older history missing)');
  if (!chart?.total_volumes?.length) warnings.push('daily volume unavailable from market_chart');
  // Keep only the contiguous history: an older window is used only if every newer window came back.
  const olderHistory: number[][] = [];
  if (older?.length) {
    for (const rows of extra) {
      if (!rows?.length) { warnings.push(`daily warm-up history shorter than requested (${windows} × 180 days)`); break; }
      olderHistory.unshift(...rows);
    }
  }
  const bars = dedupeByTime([...asBars(olderHistory, '1d'), ...asBars(older, '1d'), ...asBars(recent, '1d')]);
  const { completed } = splitPartialBar(bars, '1d', nowMs);
  const value: CompletedDaily = { bars: completed, volumes: chart?.total_volumes ?? [], warnings, windows };
  if (chart) rememberCompleted(key, value, nowMs);
  return value;
}

export interface CryptoDailyIncrement {
  /** Completed daily bars opening at or after `sinceOpenMs − 2 days`, ascending, volumes attached where available. */
  bars: Bar[];
  /** Daily 00:00 UTC volume points (plus the live point) covering the last ~92 days, for re-attaching to history. */
  volumes: Array<[number, number]>;
  warnings: string[];
}

/**
 * Only the daily bars missing since `sinceOpenMs` (the open time of the newest bar the caller holds), in 2 CoinGecko
 * calls: one `ohlc/range interval=daily` over the gap (+2 days of overlap so a candle CoinGecko revised is re-read) and
 * one >90-day `market_chart/range` for the daily volume points. A full history costs 3 calls per refresh and re-reads
 * 360 days. Returns null when the gap is too long for one daily window — the caller must refetch the full history.
 * Throws when CoinGecko returns no OHLC at all (provider failure, not "no new bar").
 */
export async function fetchCryptoDailyIncrement(
  coinId: string,
  sinceOpenMs: number,
  nowMs = Date.now(),
  requestOptions?: RequestOptions,
): Promise<CryptoDailyIncrement | null> {
  const { liveEndS } = cryptoRequestAnchors(nowMs);
  const fromS = Math.floor(sinceOpenMs / 1000) - 2 * DAY_S;
  if (!Number.isFinite(fromS) || fromS <= 0 || fromS >= liveEndS || liveEndS - fromS > DAILY_MAX_DAYS * DAY_S) return null;
  const [rows, chart] = await Promise.all([
    getOHLCRange(coinId, fromS, liveEndS, requestOptions),
    getMarketChartRange(coinId, liveEndS - DAILY_VOLUME_RANGE_DAYS * DAY_S, liveEndS, requestOptions),
  ]);
  if (rows == null) throw new Error(`CoinGecko daily OHLC unavailable for ${coinId}`);
  const warnings: string[] = [];
  const volumes = chart?.total_volumes ?? [];
  if (!volumes.length) warnings.push('daily volume unavailable from market_chart');
  const { completed } = splitPartialBar(attachDailyVolumes(dedupeByTime(asBars(rows, '1d')), volumes), '1d', nowMs);
  return { bars: completed, volumes, warnings };
}

async function fetchHourlyBars(coinId: string, nowMs: number, requestOptions?: RequestOptions): Promise<Bar[]> {
  const { liveEndS } = cryptoRequestAnchors(nowMs);
  const rows = await getOHLCRange(coinId, liveEndS - HOURLY_MAX_DAYS * DAY_S, liveEndS, requestOptions, 'hourly');
  if (!rows?.length) throw new Error(`CoinGecko hourly OHLC unavailable for ${coinId}`);
  return dedupeByTime(asBars(rows, '1h'));
}

export async function fetchCryptoSeries(
  symbolOrId: string,
  timeframe: CryptoScanTimeframe,
  nowMs = Date.now(),
  opts: {
    /** Already-resolved CoinGecko id; skips ticker resolution (never treat an id like 'bitcoin' as a ticker). */ coinId?: string;
    requestOptions?: RequestOptions;
    /** Daily/weekly only: number of 180-day OHLC windows to fetch (default 2 ≈ 360 bars, max 8). More history lets a
     *  200-period EMA converge (an SMA-seeded EMA200 on 360 bars still carries ~20% of its seed). */
    dailyWindows?: number;
  } = {},
): Promise<CryptoSeries> {
  const base = symbolOrId.replace(/[-/]?(USDT|USD)$/i, '').toUpperCase();
  const coinId = opts.coinId ?? (await resolveSymbolToId(base)) ?? symbolOrId.toLowerCase();
  // Request ends trail now by ≥ 1 minute (CoinGecko error 10014) and sit on bar boundaries: see cryptoRequestAnchors.
  const warnings: string[] = [];
  let bars: Bar[];
  let barInterval: ScanBarInterval;
  let hlBasis: CryptoSeries['hlBasis'] = 'exchange_ohlc';
  let volumeBasis: CryptoSeries['volumeBasis'] = 'unavailable';
  let source: string;
  let openQuote: Promise<SharedOpen | null> | null = null;

  if (timeframe === 'daily' || timeframe === 'weekly') {
    const windows = Math.min(MAX_DAILY_WINDOWS, Math.max(2, Math.floor(opts.dailyWindows ?? DEFAULT_DAILY_WINDOWS)));
    const { dayStartS } = cryptoRequestAnchors(nowMs);
    const shared = await readSharedCompleted(coinId, dayStartS, windows, nowMs);
    // A warm shared series returns here with no CoinGecko call, including when the minute has moved.
    if (shared && timeframe === 'daily') openQuote = readSharedOpenQuote(coinId, nowMs);
    else if (!shared && timeframe === 'daily') openQuote = requestOpenQuote(coinId, nowMs);
    const d = shared ?? await fetchDailyBars(coinId, nowMs, opts.requestOptions, windows);
    warnings.push(...d.warnings);
    warnings.push('Daily OHLC uses CoinGecko aggregate prices, not a single exchange. /ohlc/range does not document a precision parameter; ATR can differ from venue candles.');
    const daily = attachDailyVolumes(d.bars, d.volumes);
    if (d.volumes.length) volumeBasis = 'coingecko_daily_total_volume';
    source = 'coingecko ohlc/range interval=daily + market_chart/range total_volumes';
    if (timeframe === 'daily') { bars = daily; barInterval = '1d'; }
    else {
      // Weekly = Monday-anchored aggregate of COMPLETED daily bars only, so a half-finished day never leaks into a week.
      const { completed } = splitPartialBar(daily, '1d', nowMs);
      bars = aggregateBars(completed, '1w'); barInterval = '1w';
      source += ' → aggregated to Monday-anchored weekly bars';
    }
  } else if (timeframe === '1h') {
    bars = await fetchHourlyBars(coinId, nowMs, opts.requestOptions); barInterval = '1h';
    source = 'coingecko ohlc/range interval=hourly';
    warnings.push('hourly volume not provided by CoinGecko — volume factors unavailable on 1H');
  } else if (timeframe === '30m') {
    // /ohlc with days=1 returns genuine 30-minute candles (CoinGecko granularity rule: 1–2 days → 30m).
    const fine = await getOHLC(coinId, 1, opts.requestOptions);
    if (!fine?.length) throw new Error(`CoinGecko 30-minute OHLC unavailable for ${coinId}`);
    const gapMin = fine.length > 2 ? Math.round((fine[1][0] - fine[0][0]) / 60_000) : 30;
    if (gapMin !== 30 && gapMin !== 240) throw new Error(`Unsupported CoinGecko OHLC interval: ${gapMin}m`);
    const fineBars = dedupeByTime(asBars(fine, gapMin === 30 ? '30m' : '4h'));
    bars = gapMin <= 30 ? aggregateBars(fineBars, '30m') : fineBars;
    barInterval = gapMin <= 30 ? '30m' : '4h';
    source = `coingecko /ohlc days=1 (${gapMin}m candles)`;
    warnings.push('30m history limited to ~1 day (EMA200 unavailable); volume unavailable');
  } else {
    // 15m: CoinGecko exposes no sub-hourly OHLC; aggregate 5-minute price samples from a ≤1-day range.
    const { liveEndS } = cryptoRequestAnchors(nowMs);
    const chart = await getMarketChartRange(coinId, liveEndS - DAY_S, liveEndS, opts.requestOptions);
    if (!chart?.prices?.length) throw new Error(`CoinGecko 5-minute prices unavailable for ${coinId}`);
    bars = barsFromPriceSamples(chart.prices, '15m'); barInterval = '15m'; hlBasis = 'price_samples';
    source = 'coingecko market_chart/range (5-minute price samples → 15m bars)';
    warnings.push('15m high/low approximated from 5-minute price samples; only ~1 day of history (EMA200 unavailable)');
  }

  const { completed, partial: splitPartial } = splitPartialBar(bars, barInterval, nowMs);
  const quote = openQuote ? await openQuote : null;
  const partial = timeframe === 'daily' && quote
    ? partialFromQuote(cryptoRequestAnchors(nowMs).dayStartS, completed, quote.quote)
    : splitPartial;
  const lastCompleted = completed[completed.length - 1] ?? null;
  const priceAsOf = timeframe === 'daily' && quote
    ? new Date(quote.asOfMs).toISOString()
    : (timeframe === 'daily' ? lastCompleted?.t ?? null : partial?.t ?? lastCompleted?.t ?? null);
  const priceStale = timeframe === 'daily' ? (quote ? quote.stale : true) : false;
  const priceLabel = timeframe === 'daily' && quote
    ? `as of ${priceAsOf}`
    : timeframe === 'daily'
      ? (lastCompleted ? `yesterday's close, as of ${lastCompleted.t}` : `yesterday's close`)
      : (priceAsOf ? `as of ${priceAsOf}` : 'price time not recorded');
  return {
    coinId, timeframe, barInterval, bars: completed, partialBar: partial,
    lastCompletedBarAt: lastCompleted?.t ?? null,
    currentPrice: partial?.close ?? lastCompleted?.close ?? null,
    priceAsOf, priceStale, priceLabel,
    hlBasis, volumeBasis, source, warnings,
  };
}
