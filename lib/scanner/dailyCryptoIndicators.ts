/**
 * Daily crypto indicators for the scan-daily cron (app/api/jobs/scan-daily).
 *
 * Indicators are computed locally from the REAL coin's daily OHLC history
 * (CoinGecko daily candles via fetchCryptoSeries — the same source the main
 * scanner uses) with the shared lib/scanner-indicators math. Previously the
 * cron asked Alpha Vantage for RSI/MACD/EMA/etc. with a bare `symbol=ETH`,
 * which Alpha Vantage resolves as a US equity ticker (e.g. the Grayscale
 * Ethereum Mini Trust ETF), so crypto scores were computed on ETF prices.
 */
import {
  calculateEMA, calculateRSI, calculateMACD, calculateADX,
  calculateStochastic, calculateAroon, calculateCCI, type OHLCV,
} from '@/lib/scanner-indicators';
import { fetchCryptoSeries, type CryptoSeries } from '@/lib/scanner/cryptoBars';
import type { Bar } from '@/lib/scanner/barAggregation';

/** Drop a crypto result when price and EMA200 are more than this many times apart. */
export const EMA200_SANITY_MAX_RATIO = 5;

export interface CryptoDailyIndicators {
  price?: number;
  ema200?: number;
  rsi?: number;
  macd?: number;
  macdSignal?: number;
  adx?: number;
  stochK?: number;
  stochD?: number;
  aroonUp?: number;
  aroonDown?: number;
  cci?: number;
  /** Open time (ISO-8601 UTC) of the last daily bar the indicators were computed on. Read by dailyPickTrust. */
  lastBarAt?: string;
}

const finite = (v: number): number | undefined => (Number.isFinite(v) ? v : undefined);

/**
 * Compute the scan-daily indicator set from completed daily bars (ascending).
 * Periods match the previous Alpha Vantage requests: RSI 14, MACD 12/26/9,
 * EMA 200, ADX 14 (Wilder), Aroon 25, CCI 20, Stochastic 14/1/3 (TradingView default) — lib/ta/core maths.
 */
export function computeCryptoDailyIndicators(bars: Bar[]): CryptoDailyIndicators {
  const ohlcv: OHLCV[] = bars.map((b) => ({
    date: b.t, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? 0,
  }));
  const closes = ohlcv.map((b) => b.close);
  if (closes.length === 0) return {};

  const ema200Series = calculateEMA(closes, 200);
  const macd = calculateMACD(closes);
  const stoch = calculateStochastic(ohlcv, 14);
  const aroon = calculateAroon(ohlcv, 25);

  const out: CryptoDailyIndicators = {
    ema200: closes.length >= 200 ? finite(ema200Series[ema200Series.length - 1]) : undefined,
    rsi: finite(calculateRSI(closes, 14)),
    macd: finite(macd.macd),
    macdSignal: finite(macd.signal),
    adx: finite(calculateADX(ohlcv, 14)),
    stochK: finite(stoch.k),
    stochD: finite(stoch.d),
    aroonUp: finite(aroon.up),
    aroonDown: finite(aroon.down),
    cci: finite(calculateCCI(ohlcv, 20)),
  };
  for (const key of Object.keys(out) as (keyof CryptoDailyIndicators)[]) {
    if (out[key] === undefined) delete out[key];
  }
  if (Object.keys(out).length > 0) out.lastBarAt = bars[bars.length - 1].t;
  return out;
}

/** Same indicator set for any asset's completed daily bars (scan-daily uses it for equities too). */
export const computeDailyIndicators = computeCryptoDailyIndicators;

/**
 * Returns a reason string when price and EMA200 are implausibly far apart
 * (e.g. an equity/ETF series mixed with a coin price), otherwise null.
 */
export function ema200SanityFailure(
  price: number | null | undefined,
  ema200: number | null | undefined,
  maxRatio = EMA200_SANITY_MAX_RATIO,
): string | null {
  if (price == null || ema200 == null) return null;
  if (!(price > 0) || !(ema200 > 0)) return `non-positive price/EMA200 (price=${price}, ema200=${ema200})`;
  const ratio = Math.max(price / ema200, ema200 / price);
  if (ratio > maxRatio) {
    return `price ${price} vs EMA200 ${ema200} differ by ${ratio.toFixed(1)}x (limit ${maxRatio}x)`;
  }
  return null;
}

/** scan-daily crypto history: 6 × 180-day CoinGecko windows (~1,080 bars, 4 more OHLC calls per coin than the
 *  default 2) so the stored EMA200 and the canonical verdict's EMA200 converge (RS-4). The job runs once a day over
 *  ~50 coins, so this adds ~200 CoinGecko calls per run. */
export const DAILY_SCAN_CRYPTO_WINDOWS = 6;

export type CryptoDailyScanOutcome =
  | { ok: true; price: number; indicators: CryptoDailyIndicators; barCount: number; source: string; /** Completed daily bars used (oldest first), for the canonical engine. */ bars: Bar[] }
  | { ok: false; reason: string };

/**
 * Fetch real daily coin history and build the scan-daily indicator set.
 * `spotPrice` (e.g. Alpha Vantage CURRENCY_EXCHANGE_RATE) is used as the
 * displayed price when available; otherwise the latest CoinGecko price.
 */
export async function scanCryptoDailyIndicators(
  symbol: string,
  spotPrice: number | null,
  fetchSeries: (symbol: string) => Promise<CryptoSeries> = (s) =>
    fetchCryptoSeries(s, 'daily', Date.now(), { dailyWindows: DAILY_SCAN_CRYPTO_WINDOWS, requestOptions: { retries: 1, timeoutMs: 10_000 } }),
): Promise<CryptoDailyScanOutcome> {
  let series: CryptoSeries;
  try {
    series = await fetchSeries(symbol);
  } catch (e) {
    return { ok: false, reason: `daily history unavailable: ${e instanceof Error ? e.message : String(e)}` };
  }

  const indicators = computeCryptoDailyIndicators(series.bars);
  if (Object.keys(indicators).length === 0) {
    return { ok: false, reason: `insufficient daily history (${series.bars.length} bars)` };
  }

  const price = spotPrice != null && Number.isFinite(spotPrice) && spotPrice > 0 ? spotPrice : series.currentPrice;
  if (price == null || !Number.isFinite(price) || price <= 0) {
    return { ok: false, reason: 'no current price' };
  }

  const sanity = ema200SanityFailure(price, indicators.ema200);
  if (sanity) return { ok: false, reason: `EMA200 sanity check failed: ${sanity}` };

  return {
    ok: true,
    price,
    indicators: { price, ...indicators },
    barCount: series.bars.length,
    source: series.source,
    bars: series.bars,
  };
}
