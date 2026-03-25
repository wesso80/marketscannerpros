/**
 * Intraday Data Fetcher for the Quant Pipeline
 * @internal — NEVER import into user-facing components.
 *
 * Fetches intraday bars (15min / 60min) from Alpha Vantage and computes
 * indicators locally. Returns CachedScanData-compatible objects so the
 * discovery engine can treat them identically to daily data.
 *
 * Supports both equities (TIME_SERIES_INTRADAY) and crypto (CRYPTO_INTRADAY).
 *
 * This gives the quant pipeline earlier signals on momentum shifts before
 * the daily timeframe confirms.
 */

import { calculateAllIndicators, type OHLCVBar } from '@/lib/indicators';
import { avTryToken } from '@/lib/avRateGovernor';
import { avCircuit } from '@/lib/circuitBreaker';
import type { CachedScanData } from '@/lib/scannerCache';

export type IntradayInterval = '15min' | '60min';

const AV_KEY = () => process.env.ALPHA_VANTAGE_API_KEY || '';

/**
 * Fetch intraday bars for a single equity symbol from Alpha Vantage.
 */
async function fetchEquityIntradayBars(
  symbol: string,
  interval: IntradayInterval,
): Promise<OHLCVBar[] | null> {
  if (!AV_KEY()) return null;
  if (!(await avTryToken())) return null;

  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=compact&entitlement=realtime&apikey=${AV_KEY()}`;

  try {
    const res = await avCircuit.call(() => fetch(url, { signal: AbortSignal.timeout(15_000) }));
    if (!res.ok) return null;

    const json = await res.json();
    const tsKey = `Time Series (${interval})`;
    const timeSeries = json[tsKey];
    if (!timeSeries) return null;

    return parseTimeSeries(timeSeries);
  } catch {
    return null;
  }
}

/**
 * Fetch intraday bars for a single crypto symbol via CRYPTO_INTRADAY.
 * Symbol should be base only (e.g. 'BTC', not 'BTCUSD').
 */
async function fetchCryptoIntradayBars(
  symbol: string,
  interval: IntradayInterval,
): Promise<OHLCVBar[] | null> {
  if (!AV_KEY()) return null;
  if (!(await avTryToken())) return null;

  const base = symbol.replace(/-?USD$/i, '').toUpperCase();
  const url = `https://www.alphavantage.co/query?function=CRYPTO_INTRADAY&symbol=${encodeURIComponent(base)}&market=USD&interval=${interval}&outputsize=compact&apikey=${AV_KEY()}`;

  try {
    const res = await avCircuit.call(() => fetch(url, { signal: AbortSignal.timeout(15_000) }));
    if (!res.ok) return null;

    const json = await res.json();
    // CRYPTO_INTRADAY uses a dynamic key like "Time Series Crypto (15min)"
    const tsKey = Object.keys(json).find(k => k.includes('Time Series'));
    if (!tsKey) return null;

    return parseTimeSeries(json[tsKey]);
  } catch {
    return null;
  }
}

/** Parse AV time series object into sorted OHLCVBar array. */
function parseTimeSeries(timeSeries: Record<string, Record<string, string>>): OHLCVBar[] | null {
  const bars: OHLCVBar[] = [];
  for (const [timestamp, values] of Object.entries(timeSeries)) {
    bars.push({
      timestamp,
      open: parseFloat(values['1. open'] || '0'),
      high: parseFloat(values['2. high'] || '0'),
      low: parseFloat(values['3. low'] || '0'),
      close: parseFloat(values['4. close'] || '0'),
      volume: Math.round(parseFloat(values['5. volume'] || values['6. volume'] || '0')),
    });
  }
  bars.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return bars.length > 0 ? bars : null;
}

/**
 * Build CachedScanData from intraday bars + computed indicators.
 */
function barsToScanData(bars: OHLCVBar[]): CachedScanData | null {
  if (bars.length < 20) return null; // Not enough data for indicators

  const computed = calculateAllIndicators(bars);
  const latest = bars[bars.length - 1];

  const safe = (v: number | null | undefined): number =>
    v != null && Number.isFinite(v) ? v : 0;

  return {
    price: latest.close,
    rsi: safe(computed.rsi14),
    macdLine: safe(computed.macdLine),
    macdSignal: safe(computed.macdSignal),
    macdHist: safe(computed.macdHist),
    ema200: safe(computed.ema200),
    atr: safe(computed.atr14),
    adx: safe(computed.adx14),
    stochK: safe(computed.stochK),
    stochD: safe(computed.stochD),
    cci: safe(computed.cci20),
    aroonUp: 0,
    aroonDown: 0,
    volume: latest.volume > 0 ? latest.volume : undefined,
    obv: computed.obv != null ? computed.obv : undefined,
    vwap: computed.vwap != null ? computed.vwap : undefined,
    mfi: computed.mfi14 != null ? computed.mfi14 : undefined,
    atrPercent: computed.atrPercent14 != null ? computed.atrPercent14 : undefined,
    source: 'database',
  };
}

/**
 * Fetch intraday data for a batch of symbols.
 * Uses TIME_SERIES_INTRADAY for equities and CRYPTO_INTRADAY for crypto.
 * Returns a Map of symbol → CachedScanData.
 */
export async function getBulkIntradayScanData(
  symbols: string[],
  interval: IntradayInterval,
  assetType: 'equity' | 'crypto' = 'equity',
): Promise<Map<string, CachedScanData>> {
  const results = new Map<string, CachedScanData>();

  const fetcher = assetType === 'crypto' ? fetchCryptoIntradayBars : fetchEquityIntradayBars;

  // Process in batches to respect rate limits
  const BATCH_SIZE = 8;
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (symbol) => {
      try {
        const bars = await fetcher(symbol, interval);
        if (bars) {
          const data = barsToScanData(bars);
          if (data) results.set(symbol.toUpperCase(), data);
        }
      } catch {
        // Skip symbol on error
      }
    });
    await Promise.all(promises);
  }

  console.log(`[quant:intraday] Got ${interval} ${assetType} data for ${results.size}/${symbols.length} symbols`);
  return results;
}
