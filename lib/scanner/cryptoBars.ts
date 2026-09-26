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
 */
import { getOHLC, getOHLCRange, getMarketChartRange, resolveSymbolToId } from '@/lib/coingecko';
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
  hlBasis: 'exchange_ohlc' | 'price_samples';
  volumeBasis: 'coingecko_daily_total_volume' | 'unavailable';
  source: string;
  warnings: string[];
}

const DAY_S = 86_400;
const HOURLY_MAX_DAYS = 31;
const DAILY_MAX_DAYS = 180;
/** Default daily history: 2 × 180-day windows (~360 bars). */
const DEFAULT_DAILY_WINDOWS = 2;
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

/** Next data-cache lifetime for a history window that ends on a completed-bar boundary (its candles never change). */
const COMPLETED_WINDOW_CACHE_S = 6 * 60 * 60;
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

async function fetchDailyBars(coinId: string, nowMs: number, requestOptions?: RequestOptions, windows = DEFAULT_DAILY_WINDOWS): Promise<{ bars: Bar[]; volumes: Array<[number, number]>; warnings: string[] }> {
  const warnings: string[] = [];
  const { liveEndS, dayStartS } = cryptoRequestAnchors(nowMs);
  const completedOpts = { ...requestOptions, cacheSeconds: COMPLETED_WINDOW_CACHE_S };
  // Window k ≥ 1 ends on the UTC day boundary (a completed-bar close) and starts 1 h after the boundary 180·(k+1) days
  // back, so it holds exactly the daily closes the old `now − 180·(k+1)d … now − 180·k d` window held (≤ 180 days,
  // the Pro daily limit) but its URL no longer changes every second. Window 0 still ends at the live edge.
  const completedWindow = (k: number) => getOHLCRange(
    coinId, dayStartS - (k + 1) * DAILY_MAX_DAYS * DAY_S + 3600, dayStartS - k * DAILY_MAX_DAYS * DAY_S, completedOpts,
  );
  // Extra 180-day windows further back (index 2..windows-1) are warm-up history only (e.g. EMA200 convergence);
  // volume stays on the most recent ~360 days.
  const extraWindows = Array.from({ length: Math.max(0, windows - DEFAULT_DAILY_WINDOWS) }, (_, i) => i + DEFAULT_DAILY_WINDOWS);
  const [recent, older, chart, ...extra] = await Promise.all([
    getOHLCRange(coinId, liveEndS - DAILY_MAX_DAYS * DAY_S, liveEndS, requestOptions),
    completedWindow(1),
    getMarketChartRange(coinId, dayStartS - 2 * DAILY_MAX_DAYS * DAY_S + 3600, liveEndS, requestOptions),
    ...extraWindows.map((k) => completedWindow(k)),
  ]);
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
  return { bars: dedupeByTime([...asBars(olderHistory, '1d'), ...asBars(older, '1d'), ...asBars(recent, '1d')]), volumes: chart?.total_volumes ?? [], warnings };
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

  if (timeframe === 'daily' || timeframe === 'weekly') {
    const windows = Math.min(MAX_DAILY_WINDOWS, Math.max(DEFAULT_DAILY_WINDOWS, Math.floor(opts.dailyWindows ?? DEFAULT_DAILY_WINDOWS)));
    const d = await fetchDailyBars(coinId, nowMs, opts.requestOptions, windows);
    warnings.push(...d.warnings);
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

  const { completed, partial } = splitPartialBar(bars, barInterval, nowMs);
  const lastCompleted = completed[completed.length - 1] ?? null;
  return {
    coinId, timeframe, barInterval, bars: completed, partialBar: partial,
    lastCompletedBarAt: lastCompleted?.t ?? null,
    currentPrice: partial?.close ?? lastCompleted?.close ?? null,
    hlBasis, volumeBasis, source, warnings,
  };
}
