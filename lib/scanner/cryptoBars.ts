/**
 * Genuine-timeframe crypto bars for the scanner (CoinGecko Pro).
 *
 * Sources (verified live 2026-09-20 against pro-api.coingecko.com):
 *  - /coins/{id}/ohlc/range?interval=daily  → true DAILY OHLC, ≤180 days per call (we take 2 calls → ~360 bars).
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
import { aggregateBars, attachDailyVolumes, barsFromPriceSamples, splitPartialBar, type Bar, type ScanBarInterval } from './barAggregation';

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

const asBars = (rows: number[][] | null): Bar[] =>
  (rows ?? [])
    .filter((r) => Array.isArray(r) && r.length >= 5 && r.slice(1, 5).every((v) => Number.isFinite(Number(v))))
    .map((r) => ({ t: new Date(r[0]).toISOString(), open: Number(r[1]), high: Number(r[2]), low: Number(r[3]), close: Number(r[4]), volume: null }));

const dedupeByTime = (bars: Bar[]): Bar[] => {
  const m = new Map<string, Bar>();
  for (const b of bars) m.set(b.t, b);
  return [...m.values()].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
};

async function fetchDailyBars(coinId: string, nowS: number): Promise<{ bars: Bar[]; volumes: Array<[number, number]>; warnings: string[] }> {
  const warnings: string[] = [];
  const [recent, older, chart] = await Promise.all([
    getOHLCRange(coinId, nowS - DAILY_MAX_DAYS * DAY_S, nowS),
    getOHLCRange(coinId, nowS - 2 * DAILY_MAX_DAYS * DAY_S, nowS - DAILY_MAX_DAYS * DAY_S),
    getMarketChartRange(coinId, nowS - 2 * DAILY_MAX_DAYS * DAY_S, nowS),
  ]);
  if (!recent?.length) throw new Error(`CoinGecko daily OHLC unavailable for ${coinId}`);
  if (!older?.length) warnings.push('only ~180 daily bars available (older history missing)');
  if (!chart?.total_volumes?.length) warnings.push('daily volume unavailable from market_chart');
  return { bars: dedupeByTime([...asBars(older), ...asBars(recent)]), volumes: chart?.total_volumes ?? [], warnings };
}

async function fetchHourlyBars(coinId: string, nowS: number): Promise<Bar[]> {
  const rows = await getOHLCRange(coinId, nowS - HOURLY_MAX_DAYS * DAY_S, nowS, undefined, 'hourly');
  if (!rows?.length) throw new Error(`CoinGecko hourly OHLC unavailable for ${coinId}`);
  return dedupeByTime(asBars(rows));
}

export async function fetchCryptoSeries(
  symbolOrId: string,
  timeframe: CryptoScanTimeframe,
  nowMs = Date.now(),
  opts: { /** Already-resolved CoinGecko id; skips ticker resolution (never treat an id like 'bitcoin' as a ticker). */ coinId?: string } = {},
): Promise<CryptoSeries> {
  const base = symbolOrId.replace(/[-/]?(USDT|USD)$/i, '').toUpperCase();
  const coinId = opts.coinId ?? (await resolveSymbolToId(base)) ?? symbolOrId.toLowerCase();
  // CoinGecko rejects `to` values even a few seconds ahead of its own clock (error 10014); trail by one minute.
  const nowS = Math.floor(nowMs / 1000) - 60;
  const warnings: string[] = [];
  let bars: Bar[];
  let barInterval: ScanBarInterval;
  let hlBasis: CryptoSeries['hlBasis'] = 'exchange_ohlc';
  let volumeBasis: CryptoSeries['volumeBasis'] = 'unavailable';
  let source: string;

  if (timeframe === 'daily' || timeframe === 'weekly') {
    const d = await fetchDailyBars(coinId, nowS);
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
    bars = await fetchHourlyBars(coinId, nowS); barInterval = '1h';
    source = 'coingecko ohlc/range interval=hourly';
    warnings.push('hourly volume not provided by CoinGecko — volume factors unavailable on 1H');
  } else if (timeframe === '30m') {
    // /ohlc with days=1 returns genuine 30-minute candles (CoinGecko granularity rule: 1–2 days → 30m).
    const fine = await getOHLC(coinId, 1);
    if (!fine?.length) throw new Error(`CoinGecko 30-minute OHLC unavailable for ${coinId}`);
    const fineBars = dedupeByTime(asBars(fine));
    const gapMin = fineBars.length > 2 ? Math.round((Date.parse(fineBars[1].t) - Date.parse(fineBars[0].t)) / 60_000) : 30;
    bars = gapMin <= 30 ? aggregateBars(fineBars, '30m') : fineBars;
    barInterval = gapMin <= 30 ? '30m' : '4h';
    source = `coingecko /ohlc days=1 (${gapMin}m candles)`;
    warnings.push('30m history limited to ~1 day (EMA200 unavailable); volume unavailable');
  } else {
    // 15m: CoinGecko exposes no sub-hourly OHLC; aggregate 5-minute price samples from a ≤1-day range.
    const chart = await getMarketChartRange(coinId, nowS - DAY_S, nowS);
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
