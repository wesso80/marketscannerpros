import { equityCandles, aggregateEquityCandles } from '@/lib/market/equityCandles';
import { getPriceBySymbol } from '@/lib/coingecko';
import { closedCandles, aggregateClosedCandles, type ClosedCandle } from '@/lib/market/candleIntegrity';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { hasPaidSessionAccess } from '@/lib/proTraderAccess';
import { computeTimeGravityMap, type CoverageDiagnostics } from '@/lib/time/timeGravityMap';
import { TF_WEIGHTS, type MidpointRecord } from '@/lib/time/midpointDebt';
import { getMidpointService } from '@/lib/midpointService';
import { getCandleProcessor, parseCoinGeckoOHLC } from '@/lib/candleProcessor';
import type { OHLCVBar } from '@/lib/candleProcessor';
import { getOHLC, resolveSymbolToId, symbolToId } from '@/lib/coingecko';
import { avFetch } from '@/lib/avRateGovernor';
import { q } from '@/lib/db';
import { getQuote } from '@/lib/onDemandFetch';

/**
 * Time Gravity Map API Endpoint
 * 
 * GET /api/time-gravity-map?symbol=BTCUSD&price=68000
 * 
 * Query Params:
 * - symbol: Trading symbol (required)
 * - price: Current price (required)
 * - maxDistance: Max distance % to fetch midpoints (default: 10)
 * - midpoints: JSON array of midpoint records (optional, overrides database)
 * 
 * New behaviour:
 * - Tags midpoints that the current price has touched or overshot BEFORE
 *   computing the gravity map, so stale targets are cleared every request.
 * - Returns `targetStatus` and `taggingStats` for reactive UI.
 * - ON-DEMAND: If no midpoints exist for a symbol, fetches candle data
 *   (CoinGecko for crypto, Alpha Vantage for equity), computes & stores
 *   midpoints in the DB, and adds the symbol to symbol_universe for the
 *   worker to maintain going forward.
 */

// ── Detect whether a symbol is crypto ──────────────────────────────────────
const CRYPTO_SUFFIXES = ['USD', 'USDT', 'USDC', 'BTC', 'ETH', 'BUSD'];
const KNOWN_CRYPTO = new Set([
  'BTC','ETH','SOL','XRP','ADA','DOGE','DOT','AVAX','MATIC','LINK','UNI','ATOM',
  'TRX','NEAR','SHIB','LTC','BCH','HBAR','FIL','VET','IMX','APT','GRT','INJ',
  'OP','THETA','FTM','RUNE','LDO','ALGO','XMR','AAVE','MKR','STX','EGLD','FLOW',
  'AXS','SAND','EOS','XTZ','NEO','KAVA','CFX','MINA','SNX','CRV','DYDX','BLUR',
  'AR','SUI','SEI','TIA','JUP','WIF','PEPE','BONK','FLOKI','PYTH','STRK','WLD',
  'FET','RNDR','AGIX','OCEAN','TAO','ROSE','ZIL','IOTA','ZEC','DASH','BAT','ZRX',
  'ENJ','MANA','GALA','APE','GMT','ARB','MAGIC','GMX','COMP','YFI','SUSHI',
  '1INCH','BNB','TON','NOT','PENDLE','JTO','ENA','ETHFI','W','DYM','PIXEL',
]);
function isCryptoSymbol(symbol: string): boolean {
  const upper = symbol.toUpperCase();
  if (CRYPTO_SUFFIXES.some(s => upper.endsWith(s) && upper.length > s.length)) return true;
  if (KNOWN_CRYPTO.has(upper)) return true;
  return false;
}

function isLocalTimeGravityDemoAllowed(): boolean {
  return process.env.LOCAL_DEMO_MARKET_DATA === 'true' || process.env.NODE_ENV !== 'production';
}

function buildLocalDemoMidpoints(symbol: string, currentPrice: number, assetType: 'crypto' | 'equity'): MidpointRecord[] {
  const now = new Date();
  const tfSpecs = assetType === 'crypto'
    ? [
        ['30m', 0.32, 0.16],
        ['1H', 0.42, 0.18],
        ['4H', 0.55, 0.22],
        ['1D', 0.72, 0.34],
        ['1W', -1.15, 0.70],
      ] as const
    : [
        ['1H', 0.40, 0.18],
        ['2H', 0.50, 0.20],
        ['4H', 0.66, 0.26],
        ['1D', 0.90, 0.38],
        ['1W', -1.35, 0.80],
      ] as const;

  return tfSpecs.map(([timeframe, distancePct, halfRangePct], index) => {
    const midpoint = currentPrice * (1 + distancePct / 100);
    const high = midpoint * (1 + halfRangePct / 100);
    const low = midpoint * (1 - halfRangePct / 100);
    const range = high - low;
    const candleCloseTime = new Date(now.getTime() - (index + 1) * 60 * 60_000);
    const candleOpenTime = new Date(candleCloseTime.getTime() - (index + 1) * 60 * 60_000);
    return {
      timeframe,
      midpoint,
      high,
      low,
      range,
      retrace30High: high - range * 0.3,
      retrace30Low: low + range * 0.3,
      createdAt: candleCloseTime,
      candleOpenTime,
      candleCloseTime,
      tagged: false,
      taggedAt: null,
      distanceFromPrice: ((midpoint - currentPrice) / currentPrice) * 100,
      ageMinutes: Math.max(0, (now.getTime() - candleCloseTime.getTime()) / 60_000),
      weight: TF_WEIGHTS[timeframe] || 1,
      isAbovePrice: midpoint > currentPrice,
    };
  });
}

// ── Candle aggregation helpers ─────────────────────────────────────────────
function aggregateHourlyBars(bars: OHLCVBar[], factor: number): OHLCVBar[] {
  const result: OHLCVBar[] = [];
  for (let i = 0; i < bars.length; i += factor) {
    const chunk = bars.slice(i, i + factor);
    if (chunk.length === 0) continue;
    result.push({
      time: chunk[chunk.length - 1].time,
      open: chunk[0].open,
      high: Math.max(...chunk.map(b => b.high)),
      low: Math.min(...chunk.map(b => b.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((s, b) => s + (b.volume || 0), 0),
    });
  }
  return result;
}

function aggregate1HTo4H(bars: OHLCVBar[]): OHLCVBar[] {
  return aggregateHourlyBars(bars, 4);
}

function aggregateDailyToWeekly(bars: OHLCVBar[]): OHLCVBar[] {
  const result: OHLCVBar[] = [];
  // Group by ISO week (Mon–Fri)
  let weekBars: OHLCVBar[] = [];
  let currentWeek = -1;
  for (const bar of bars) {
    const d = bar.time;
    // ISO week number
    const jan4 = new Date(d.getFullYear(), 0, 4);
    const weekNum = Math.ceil(((d.getTime() - jan4.getTime()) / 86400000 + jan4.getDay() + 1) / 7);
    const weekKey = d.getFullYear() * 100 + weekNum;
    if (weekKey !== currentWeek && weekBars.length > 0) {
      result.push({
        time: weekBars[weekBars.length - 1].time,
        open: weekBars[0].open,
        high: Math.max(...weekBars.map(b => b.high)),
        low: Math.min(...weekBars.map(b => b.low)),
        close: weekBars[weekBars.length - 1].close,
        volume: weekBars.reduce((s, b) => s + (b.volume || 0), 0),
      });
      weekBars = [];
    }
    currentWeek = weekKey;
    weekBars.push(bar);
  }
  if (weekBars.length > 0) {
    result.push({
      time: weekBars[weekBars.length - 1].time,
      open: weekBars[0].open,
      high: Math.max(...weekBars.map(b => b.high)),
      low: Math.min(...weekBars.map(b => b.low)),
      close: weekBars[weekBars.length - 1].close,
      volume: weekBars.reduce((s, b) => s + (b.volume || 0), 0),
    });
  }
  return result;
}

// ── Parse Alpha Vantage time series JSON into OHLCVBar[] ──────────────────
function parseAVTimeSeries(timeSeries: Record<string, any>): OHLCVBar[] {
  return Object.entries(timeSeries)
    .map(([ts, v]: [string, any]) => ({
      time: new Date(ts),
      open: parseFloat(v['1. open']),
      high: parseFloat(v['2. high']),
      low: parseFloat(v['3. low']),
      close: parseFloat(v['4. close']),
      volume: parseInt(v['5. volume'] || v['6. volume'] || '0', 10),
    }))
    .filter(b => !isNaN(b.open) && !isNaN(b.close) && b.open > 0)
    .sort((a, b) => a.time.getTime() - b.time.getTime());
}

// ── On-demand generation result ───────────────────────────────────────────
interface OnDemandResult {
  totalStored: number;
  timeframesGenerated: string[];
  rateLimited: boolean;
  error?: string;
}

// ── On-demand midpoint generation cache (prevent parallel fetches) ─────────
const onDemandInFlight = new Map<string, Promise<OnDemandResult>>();

/**
 * Fetch candle data and generate midpoints on-demand for a new symbol.
 * Generates multi-timeframe midpoints (1H, 4H, 1D, 1W for equity; daily + sub-hour for crypto).
 */
async function generateMidpointsOnDemand(symbol: string, assetType: 'crypto' | 'equity'): Promise<OnDemandResult> {
  const key = `${symbol}:${assetType}`;
  const existing = onDemandInFlight.get(key);
  if (existing) return existing;

  const work = (async (): Promise<OnDemandResult> => {
    const processor = getCandleProcessor();
    let totalStored = 0;
    const timeframesGenerated: string[] = [];
    let rateLimited = false;

    if (assetType === 'crypto') {
      // Strip trailing currency suffix for CoinGecko resolution
      const baseSymbol = symbol.replace(/(USD|USDT|USDC|BUSD)$/i, '');
      const coinId = symbolToId(baseSymbol) || await resolveSymbolToId(baseSymbol);
      if (!coinId) {
        console.warn(`[TGM on-demand] Could not resolve CoinGecko ID for ${symbol}`);
        return { totalStored: 0, timeframesGenerated: [], rateLimited: false, error: `Could not resolve symbol ${symbol}` };
      }

      // Fetch 30-day daily OHLC (gives ~30 candles)
      try {
        const ohlc30 = await getOHLC(coinId, 90, { interval: 'daily', timeoutMs: 8000, retries: 0 });
        if (ohlc30 && ohlc30.length > 0) {
          const bars30 = closedCandles(ohlc30, 86400000);
          const stored = await processor.processCandleBatch(symbol, 'daily', bars30, 'crypto');
          totalStored += stored;
          if (stored > 0) timeframesGenerated.push('1D');

          // Aggregate daily to weekly
          const weeklyBars = aggregateDailyToWeekly(bars30);
          if (weeklyBars.length > 0) {
            const wStored = await processor.processCandleBatch(symbol, '1w', weeklyBars, 'crypto');
            totalStored += wStored;
            if (wStored > 0) timeframesGenerated.push('1W');
          }
        }
      } catch (err: any) {
        console.warn(`[TGM on-demand] CoinGecko daily fetch failed for ${symbol}:`, err?.message);
      }

      // Fetch 1-day OHLC (gives ~288 5-min candles → compressed to ~24 1H candles)
      try {
        const ohlc1 = await getOHLC(coinId, 1);
        if (ohlc1 && ohlc1.length > 0) {
          const bars1 = closedCandles(ohlc1, 1800000);
          const stored = await processor.processCandleBatch(symbol, '30min', bars1, 'crypto');
          totalStored += stored;
          if (stored > 0) timeframesGenerated.push('30m');
        }
      } catch (err: any) {
        console.warn(`[TGM on-demand] CoinGecko intraday fetch failed for ${symbol}:`, err?.message);
      }

      console.log(`[TGM on-demand] Generated ${totalStored} midpoints for crypto ${symbol} (${timeframesGenerated.join(', ')})`);
    } else {
      // ── Equity: Multi-timeframe on-demand generation ──────────────
      const apiKey = process.env.ALPHA_VANTAGE_API_KEY || '';
      if (!apiKey) {
        return { totalStored: 0, timeframesGenerated: [], rateLimited: false, error: 'No API key configured' };
      }

      // Clean up any crypto-typed midpoints that may have been incorrectly stored
      // for this equity symbol (e.g. widget defaulted to crypto previously)
      try {
        const cleaned = await q(
          `DELETE FROM timeframe_midpoints WHERE symbol = $1 AND asset_type = 'crypto' RETURNING id`,
          [symbol]
        );
        if (cleaned.length > 0) {
          console.log(`[TGM on-demand] Cleaned ${cleaned.length} stale crypto midpoints for equity ${symbol}`);
        }
      } catch { /* non-fatal */ }

      // 1. Fetch daily bars (compact = ~100 trading days) — avFetch blocks until token available
      //    Try DAILY_ADJUSTED first; fall back to DAILY if it returns null (premium endpoint).
      try {
        let dailyJson = await avFetch<Record<string, any>>(
          `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&outputsize=compact&entitlement=realtime&apikey=${apiKey}`,
          `TGM_DAILY_ADJ ${symbol}`,
        );
        if (!dailyJson) {
          console.warn(`[TGM on-demand] DAILY_ADJUSTED returned null for ${symbol}, trying DAILY...`);
          dailyJson = await avFetch<Record<string, any>>(
            `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=compact&entitlement=realtime&apikey=${apiKey}`,
            `TGM_DAILY ${symbol}`,
          );
        }
        if (dailyJson) {
          const tsKey = Object.keys(dailyJson).find(k => k.startsWith('Time Series'));
          if (tsKey && dailyJson[tsKey]) {
            const dailyBars = parseAVTimeSeries(dailyJson[tsKey]);
            console.log(`[TGM on-demand] AV daily for ${symbol}: ${dailyBars.length} bars parsed`);

            // Store daily midpoints (last 100 bars)
            if (dailyBars.length > 0) {
              const dStored = await processor.processCandleBatch(symbol, 'daily', dailyBars.slice(-100), 'equity');
              totalStored += dStored;
              if (dStored > 0) timeframesGenerated.push('1D');

              // Aggregate daily → weekly (no extra API call)
              const weeklyBars = aggregateDailyToWeekly(dailyBars);
              if (weeklyBars.length > 0) {
                const wStored = await processor.processCandleBatch(symbol, '1w', weeklyBars, 'equity');
                totalStored += wStored;
                if (wStored > 0) timeframesGenerated.push('1W');
              }
            }
          } else {
            console.warn(`[TGM on-demand] AV daily response for ${symbol} missing Time Series key. Keys: ${Object.keys(dailyJson).join(', ')}`);
          }
        } else {
          console.warn(`[TGM on-demand] AV daily returned null for ${symbol} (rate limit or error)`);
        }
      } catch (err: any) {
        console.warn(`[TGM on-demand] AV daily fetch failed for ${symbol}:`, err?.message);
      }

      // 2. Fetch intraday 60min bars for 1H + 4H (1 extra API call) — avFetch blocks until token
      try {
        const intradayUrl = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${encodeURIComponent(symbol)}&interval=60min&outputsize=compact&entitlement=realtime&apikey=${apiKey}`;
        const intradayJson = await avFetch<Record<string, any>>(intradayUrl, `TGM_INTRADAY ${symbol}`);
        if (intradayJson) {
          const tsKey = Object.keys(intradayJson).find(k => k.startsWith('Time Series'));
          if (tsKey && intradayJson[tsKey]) {
            const hourlyBars = parseAVTimeSeries(intradayJson[tsKey]);
            console.log(`[TGM on-demand] AV intraday for ${symbol}: ${hourlyBars.length} bars parsed`);

            // Store 1H midpoints
            if (hourlyBars.length > 0) {
              const hStored = await processor.processCandleBatch(symbol, '1H', hourlyBars, 'equity');
              totalStored += hStored;
              if (hStored > 0) timeframesGenerated.push('1H');

              // Aggregate 1H → 4H (no extra API call)
              const fourHourBars = aggregate1HTo4H(hourlyBars);
              if (fourHourBars.length > 0) {
                const fhStored = await processor.processCandleBatch(symbol, '4H', fourHourBars, 'equity');
                totalStored += fhStored;
                if (fhStored > 0) timeframesGenerated.push('4H');
              }

              // Aggregate 1H → 2H, 6H, 8H (no extra API calls)
              for (const [label, factor] of [['2H', 2], ['6H', 6], ['8H', 8]] as const) {
                const aggBars = aggregateHourlyBars(hourlyBars, factor);
                if (aggBars.length > 0) {
                  const stored = await processor.processCandleBatch(symbol, label, aggBars, 'equity');
                  totalStored += stored;
                  if (stored > 0) timeframesGenerated.push(label);
                }
              }
            }
          } else {
            console.warn(`[TGM on-demand] AV intraday response for ${symbol} missing Time Series key. Keys: ${Object.keys(intradayJson).join(', ')}`);
          }
        } else {
          console.warn(`[TGM on-demand] AV intraday returned null for ${symbol} (rate limit or error)`);
        }
      } catch (err: any) {
        console.warn(`[TGM on-demand] AV intraday fetch failed for ${symbol}:`, err?.message);
      }

      console.log(`[TGM on-demand] Generated ${totalStored} midpoints for equity ${symbol} (${timeframesGenerated.join(', ') || 'none'})`);
    }

    // Add to symbol_universe so the worker maintains it going forward
    const cleanSym = symbol.toUpperCase().replace(/\s+/g, '').trim();
    if (cleanSym.length >= 2 && cleanSym.length <= 12 && /^[A-Z0-9.\-\/=^]+$/.test(cleanSym)) {
      try {
        await q(
          `INSERT INTO symbol_universe (symbol, asset_type, tier, enabled)
           VALUES ($1, $2, 3, TRUE)
           ON CONFLICT (symbol) DO NOTHING`,
          [cleanSym, assetType]
        );
      } catch { /* non-fatal */ }
    }

    return { totalStored, timeframesGenerated, rateLimited };
  })();

  onDemandInFlight.set(key, work);
  try {
    return await work;
  } finally {
    onDemandInFlight.delete(key);
  }
}

// Build crypto targets from verified source candles. Legacy stored midpoints did
// not record a candle contract and can contain four-hour candles labelled daily.
async function verifiedCryptoMidpoints(symbol: string, price: number): Promise<MidpointRecord[]> {
  const base = symbol.replace(/[-/]?(USDT|USDC|USD)$/i, '');
  const id = symbolToId(base) || await resolveSymbolToId(base);
  if (!id) return [];
  const [dailyRows, hourlyRows, halfHourRows] = await Promise.all([
    getOHLC(id, 90, { interval: 'daily', retries: 0, timeoutMs: 8000 }),
    getOHLC(id, 7, { interval: 'hourly', retries: 0, timeoutMs: 8000 }),
    getOHLC(id, 1, { retries: 0, timeoutMs: 8000 }),
  ]);
  const daily = closedCandles(dailyRows || [], 86400000);
  const hourly = closedCandles(hourlyRows || [], 3600000);
  const series: [string, ClosedCandle[]][] = [
    ['30m', closedCandles(halfHourRows || [], 1800000)], ['1H', hourly],
    ['4H', aggregateClosedCandles(hourly, 3600000, 14400000)], ['1D', daily],
    ['1W', aggregateClosedCandles(daily, 86400000, 7 * 86400000)],
  ];
  return midpointsFromSeries(series, price);
}

function midpointsFromSeries(series: [string, ClosedCandle[]][], price: number): MidpointRecord[] {
  return series.flatMap(([timeframe, bars]) => bars.flatMap((b, i) => {
    const midpoint = (b.high + b.low) / 2, range = b.high - b.low;
    if (bars.slice(i + 1).some(later => later.low <= midpoint && later.high >= midpoint)) return [];
    return [{ timeframe, midpoint, high: b.high, low: b.low, range,
      retrace30High: b.high - range * .3, retrace30Low: b.low + range * .3,
      createdAt: b.closeTime, candleOpenTime: b.time, candleCloseTime: b.closeTime,
      tagged: false, taggedAt: null, distanceFromPrice: ((midpoint - price) / price) * 100,
      ageMinutes: (Date.now() - b.closeTime.getTime()) / 60000,
      weight: TF_WEIGHTS[timeframe] || 1, isAbovePrice: midpoint > price }];
  }));
}

async function verifiedEquityMidpoints(symbol: string, price: number): Promise<MidpointRecord[]> {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) return [];
  const base = `https://www.alphavantage.co/query?symbol=${encodeURIComponent(symbol)}&outputsize=compact&apikey=${key}`;
  const [daily, intraday] = await Promise.all([
    avFetch<Record<string, any>>(`${base}&function=TIME_SERIES_DAILY`, `TGM verified daily ${symbol}`),
    avFetch<Record<string, any>>(`${base}&function=TIME_SERIES_INTRADAY&interval=15min&extended_hours=false&entitlement=realtime`, `TGM verified intraday ${symbol}`),
  ]);
  const d = equityCandles(daily?.['Time Series (Daily)'] || {});
  const q = equityCandles(intraday?.['Time Series (15min)'] || {}, 15);
  return midpointsFromSeries([['1D', d], ['30m', aggregateEquityCandles(q,15,30)],
    ['1H', aggregateEquityCandles(q,15,60)], ['2H', aggregateEquityCandles(q,15,120)],
    ['4H', aggregateEquityCandles(q,15,240)]], price);
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasPaidSessionAccess(session)) {
      return NextResponse.json({ error: 'Time Gravity Map requires a Pro subscription' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    
    const symbol = searchParams.get('symbol')?.toUpperCase().replace(/\s+/g, '').trim() || '';
    const priceStr = searchParams.get('price');
    const midpointsStr = searchParams.get('midpoints');
    const maxDistance = parseFloat(searchParams.get('maxDistance') || '10');
    const forceGenerate = searchParams.get('forceGenerate') === '1';
    const assetTypeHint = searchParams.get('assetType'); // Widget passes 'stock' or 'crypto'
    
    if (!symbol) {
      return NextResponse.json(
        { error: 'Missing required parameter: symbol' },
        { status: 400 }
      );
    }
    
    let currentPrice = priceStr ? parseFloat(priceStr) : 0;
    
    // Auto-resolve price using the full getQuote cascade (cache → DB → live AV)
    if (!currentPrice || isNaN(currentPrice) || currentPrice <= 0) {
      try {
        const quoteData = assetTypeHint === 'crypto' || (!assetTypeHint && isCryptoSymbol(symbol)) ? await getPriceBySymbol(symbol) : await getQuote(symbol);
        if (quoteData && quoteData.price > 0) {
          currentPrice = quoteData.price;
          console.log(`[TGM API] Auto-resolved price for ${symbol}: ${currentPrice} (source: ${'provider'})`);
        }
      } catch { /* ignore — will try on-demand generation which also resolves price */ }
    }
    
    // Don't fail immediately — on-demand generation can provide the price
    const priceMissing = !currentPrice || isNaN(currentPrice) || currentPrice <= 0;
    
    let midpoints: MidpointRecord[] = [];
    let generationAttempted = false;
    const generationResult: OnDemandResult = { totalStored: 0, timeframesGenerated: [], rateLimited: false };
    
    // Priority 1: Custom midpoints from query param
    if (midpointsStr) {
      try {
        midpoints = JSON.parse(midpointsStr);
      } catch (e) {
        return NextResponse.json(
          { error: 'Invalid midpoints JSON' },
          { status: 400 }
        );
      }
    }
    else if (assetTypeHint === 'crypto' || (!assetTypeHint && isCryptoSymbol(symbol))) {
      midpoints = await verifiedCryptoMidpoints(symbol, currentPrice);
    }
    else {
      midpoints = await verifiedEquityMidpoints(symbol, currentPrice);
    }
    midpoints = midpoints.filter(m => Math.abs(m.distanceFromPrice) <= maxDistance).slice(-100);

    // Final price check — if still missing after all resolution attempts, fail
    if (!currentPrice || isNaN(currentPrice) || currentPrice <= 0) {
      return NextResponse.json(
        { error: 'Could not resolve price for this symbol. Try running a scan first.' },
        { status: 400 }
      );
    }

    // Local/demo fallback: keeps the UI and math auditable when the developer
    // machine has no midpoint DB/market-data keys. Never silently fake data in
    // production.
    const assetType: 'crypto' | 'equity' = (assetTypeHint === 'stock' || assetTypeHint === 'equity')
      ? 'equity'
      : (assetTypeHint === 'crypto' ? 'crypto' : (isCryptoSymbol(symbol) ? 'crypto' : 'equity'));

    let localDemo = false;
    const warnings: string[] = [];
    if (midpoints.length === 0 && isLocalTimeGravityDemoAllowed()) {
      midpoints = buildLocalDemoMidpoints(symbol, currentPrice, assetType);
      localDemo = true;
      warnings.push(`Local demo Time Gravity midpoints generated for ${symbol}. Not live market-data output.`);
    }

    // No midpoints found — could mean all were tagged (target hit!)
    // Still compute TGM so the state machine returns TARGET_HIT / OVERSHOT
    // instead of a static "no data" error.
    
    // Compute Time Gravity Map with the engine's own in-memory tagging
    const tgm = computeTimeGravityMap(midpoints, currentPrice, new Date(), { assetClass: assetType });
    
    // Determine data source
    const dataSource = midpointsStr ? 'custom' : (localDemo ? 'local_demo' : 'verified_closed_ohlc');

    // ── Coverage diagnostics ─────────────────────────────────────────
    const EXPECTED_TFS: Record<string, string[]> = {
      equity: ['1H', '2H', '4H', '6H', '8H', '1D', '1W'],
      crypto: ['30m', '1H', '4H', '1D', '1W'],
    };
    const expectedTfs = EXPECTED_TFS[assetType] || EXPECTED_TFS.equity;
    const availableTfs = [...new Set(midpoints.map(m => m.timeframe))];
    const missingTfs = expectedTfs.filter(tf => !availableTfs.includes(tf));

    const coverage: CoverageDiagnostics = {
      expected: expectedTfs,
      available: availableTfs,
      missing: missingTfs,
      fromDb: midpoints.length,
      onDemandGenerated: generationResult?.timeframesGenerated ?? [],
      percent: expectedTfs.length > 0
        ? Math.round((availableTfs.filter(tf => expectedTfs.includes(tf)).length / expectedTfs.length) * 100)
        : 0,
    };
    
    // Return full TGM data with generation status + diagnostics
    return NextResponse.json({
      success: true,
      symbol,
      timestamp: new Date().toISOString(),
      dataSource,
      localDemo,
      warnings,
      midpointCount: midpoints.length,
      targetStatus: tgm.targetStatus,
      data: tgm,
      coverage,
      // On-demand generation status (helps widget show proper feedback)
      generationAttempted,
      generationResult: generationAttempted ? {
        stored: generationResult?.totalStored ?? 0,
        timeframes: generationResult?.timeframesGenerated ?? [],
        rateLimited: generationResult?.rateLimited ?? false,
        error: generationResult?.error,
      } : undefined,
    });
    
  } catch (error) {
    console.error('Time Gravity Map API Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST endpoint for submitting custom midpoint data
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { symbol, currentPrice, midpoints } = body;
    const assetType = body.assetType === 'equity' || body.assetType === 'stock' ? 'equity' : 'crypto';
    
    if (!currentPrice || !midpoints) {
      return NextResponse.json(
        { error: 'Missing required fields: currentPrice, midpoints' },
        { status: 400 }
      );
    }
    
    if (!Array.isArray(midpoints)) {
      return NextResponse.json(
        { error: 'midpoints must be an array' },
        { status: 400 }
      );
    }
    
    // Compute Time Gravity Map
    const tgm = computeTimeGravityMap(midpoints, currentPrice, new Date(), { assetClass: assetType });
    
    return NextResponse.json({
      success: true,
      symbol: symbol || 'UNKNOWN',
      timestamp: new Date().toISOString(),
      data: tgm,
    });
    
  } catch (error) {
    console.error('Time Gravity Map API Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Demo data removed — production uses real midpoints from database only.
