import { NextRequest, NextResponse } from 'next/server';
import { computeTimeGravityMap, type ComputeTGMOptions } from '@/lib/time/timeGravityMap';
import type { MidpointRecord } from '@/lib/time/midpointDebt';
import { getMidpointService } from '@/lib/midpointService';
import { getCandleProcessor, parseCoinGeckoOHLC } from '@/lib/candleProcessor';
import type { OHLCVBar } from '@/lib/candleProcessor';
import { getOHLC, resolveSymbolToId, symbolToId } from '@/lib/coingecko';
import { avTryToken } from '@/lib/avRateGovernor';
import { q } from '@/lib/db';

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
function isCryptoSymbol(symbol: string): boolean {
  const upper = symbol.toUpperCase();
  if (CRYPTO_SUFFIXES.some(s => upper.endsWith(s) && upper.length > s.length)) return true;
  // Known crypto tickers
  if (['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT', 'AVAX', 'MATIC', 'LINK', 'UNI', 'ATOM'].includes(upper)) return true;
  return false;
}

// ── Candle aggregation helpers ─────────────────────────────────────────────
function aggregate1HTo4H(bars: OHLCVBar[]): OHLCVBar[] {
  const result: OHLCVBar[] = [];
  for (let i = 0; i < bars.length; i += 4) {
    const chunk = bars.slice(i, i + 4);
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
        const ohlc30 = await getOHLC(coinId, 30);
        if (ohlc30 && ohlc30.length > 0) {
          const bars30 = parseCoinGeckoOHLC(ohlc30 as [number, number, number, number, number][]);
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
          const bars1 = parseCoinGeckoOHLC(ohlc1 as [number, number, number, number, number][]);
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

      // 1. Fetch daily bars (compact = ~100 trading days)
      const canFetchDaily = await avTryToken();
      if (!canFetchDaily) {
        console.warn(`[TGM on-demand] AV rate limit hit for daily fetch, skipping ${symbol}`);
        rateLimited = true;
      } else {
        try {
          const dailyUrl = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&outputsize=compact&entitlement=realtime&apikey=${apiKey}`;
          const dailyRes = await fetch(dailyUrl, { signal: AbortSignal.timeout(15000) });
          if (dailyRes.ok) {
            const dailyJson = await dailyRes.json();
            if (dailyJson['Error Message']) {
              console.warn(`[TGM on-demand] AV error for ${symbol} daily:`, dailyJson['Error Message']);
            } else if (dailyJson['Note'] || dailyJson['Information']) {
              console.warn(`[TGM on-demand] AV limit note for ${symbol}:`, dailyJson['Note'] || dailyJson['Information']);
              rateLimited = true;
            } else {
              const tsKey = Object.keys(dailyJson).find(k => k.startsWith('Time Series'));
              if (tsKey && dailyJson[tsKey]) {
                const dailyBars = parseAVTimeSeries(dailyJson[tsKey]);

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
              }
            }
          }
        } catch (err: any) {
          console.warn(`[TGM on-demand] AV daily fetch failed for ${symbol}:`, err?.message);
        }
      }

      // 2. Fetch intraday 60min bars for 1H + 4H (1 extra API call)
      const canFetchIntraday = await avTryToken();
      if (!canFetchIntraday) {
        console.warn(`[TGM on-demand] AV rate limit hit for intraday fetch, skipping ${symbol}`);
        if (totalStored === 0) rateLimited = true;
      } else {
        try {
          const intradayUrl = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${encodeURIComponent(symbol)}&interval=60min&outputsize=compact&entitlement=realtime&apikey=${apiKey}`;
          const intradayRes = await fetch(intradayUrl, { signal: AbortSignal.timeout(15000) });
          if (intradayRes.ok) {
            const intradayJson = await intradayRes.json();
            if (!intradayJson['Error Message'] && !intradayJson['Note'] && !intradayJson['Information']) {
              const tsKey = Object.keys(intradayJson).find(k => k.startsWith('Time Series'));
              if (tsKey && intradayJson[tsKey]) {
                const hourlyBars = parseAVTimeSeries(intradayJson[tsKey]);

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
                }
              }
            }
          }
        } catch (err: any) {
          console.warn(`[TGM on-demand] AV intraday fetch failed for ${symbol}:`, err?.message);
        }
      }

      console.log(`[TGM on-demand] Generated ${totalStored} midpoints for equity ${symbol} (${timeframesGenerated.join(', ') || 'none'})`);
    }

    // Add to symbol_universe so the worker maintains it going forward
    try {
      await q(
        `INSERT INTO symbol_universe (symbol, asset_type, tier, enabled)
         VALUES ($1, $2, 3, TRUE)
         ON CONFLICT (symbol) DO NOTHING`,
        [symbol.toUpperCase(), assetType]
      );
    } catch { /* non-fatal */ }

    return { totalStored, timeframesGenerated, rateLimited };
  })();

  onDemandInFlight.set(key, work);
  try {
    return await work;
  } finally {
    onDemandInFlight.delete(key);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const symbol = searchParams.get('symbol');
    const priceStr = searchParams.get('price');
    const midpointsStr = searchParams.get('midpoints');
    const maxDistance = parseFloat(searchParams.get('maxDistance') || '10');
    const forceGenerate = searchParams.get('forceGenerate') === '1';
    
    if (!symbol) {
      return NextResponse.json(
        { error: 'Missing required parameter: symbol' },
        { status: 400 }
      );
    }
    
    let currentPrice = priceStr ? parseFloat(priceStr) : 0;
    
    // Auto-resolve price from quotes_latest when not provided
    if (!currentPrice || isNaN(currentPrice) || currentPrice <= 0) {
      try {
        const rows = await q(
          'SELECT price FROM quotes_latest WHERE symbol = $1 LIMIT 1',
          [symbol.toUpperCase()]
        );
        if (rows.length > 0 && rows[0].price) {
          currentPrice = parseFloat(rows[0].price);
        }
      } catch { /* ignore — will fall through to error */ }
    }
    
    if (!currentPrice || isNaN(currentPrice) || currentPrice <= 0) {
      return NextResponse.json(
        { error: 'Missing price — provide ?price= or ensure quotes_latest has data for this symbol' },
        { status: 400 }
      );
    }
    
    let midpoints: MidpointRecord[] = [];
    let generationAttempted = false;
    let generationResult: OnDemandResult | null = null;
    
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
    // Priority 2: Fetch from database (with pre-tagging)
    else {
      try {
        const service = getMidpointService();

        // ── PRE-TAG: mark midpoints the current price has touched ──────
        // Use a 0.1% buffer around current price for the "current bar" range
        const tagBuffer = currentPrice * 0.001;
        const touchTagged = await service.checkAndTagMidpoints(
          symbol,
          currentPrice + tagBuffer,
          currentPrice - tagBuffer
        );

        // ── OVERSHOOT TAG: mark midpoints price has clearly blown past ──
        // 5% threshold — only tags midpoints that are way behind price
        const overshootTagged = await service.tagOvershootMidpoints(
          symbol,
          currentPrice,
          0.05  // 5% overshoot threshold
        );

        if (touchTagged > 0 || overshootTagged > 0) {
          console.log(
            `[TGM API] Pre-tagged ${touchTagged} touch + ${overshootTagged} overshoot midpoints for ${symbol}`
          );
        }

        // ── NOW fetch only the remaining untagged midpoints ────────────
        midpoints = await service.getUntaggedMidpoints(symbol, currentPrice, {
          maxDistancePercent: maxDistance,
          limit: 100,
        });

        // ── ON-DEMAND: No midpoints in DB or user forced regeneration ──
        if (midpoints.length === 0 || forceGenerate) {
          const assetType = isCryptoSymbol(symbol) ? 'crypto' : 'equity';
          console.log(`[TGM API] ${forceGenerate ? 'Force generating' : 'No midpoints for'} ${symbol}, on-demand (${assetType})...`);
          generationResult = await generateMidpointsOnDemand(symbol, assetType);
          generationAttempted = true;
          if (generationResult.totalStored > 0) {
            // Re-fetch the freshly stored midpoints
            midpoints = await service.getUntaggedMidpoints(symbol, currentPrice, {
              maxDistancePercent: maxDistance,
              limit: 100,
            });
            console.log(`[TGM API] On-demand: ${generationResult.totalStored} stored, ${midpoints.length} within range for ${symbol}`);
          }
        }
      } catch (error) {
        console.error('Failed to fetch midpoints from database:', error);
        return NextResponse.json(
          {
            success: false,
            error: 'Database connection failed. Ensure midpoints table exists and is populated.',
            hint: 'Run: npm run migrate:midpoints && npm run backfill:midpoints',
          },
          { status: 503 }
        );
      }
    }

    // No midpoints found — could mean all were tagged (target hit!)
    // Still compute TGM so the state machine returns TARGET_HIT / OVERSHOT
    // instead of a static "no data" error.
    
    // Compute Time Gravity Map with the engine's own in-memory tagging
    const tgm = computeTimeGravityMap(midpoints, currentPrice);
    
    // Determine data source
    const dataSource = midpointsStr ? 'custom' : 'database';
    
    // Return full TGM data with generation status
    return NextResponse.json({
      success: true,
      symbol,
      timestamp: new Date().toISOString(),
      dataSource,
      midpointCount: midpoints.length,
      targetStatus: tgm.targetStatus,
      data: tgm,
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
    const tgm = computeTimeGravityMap(midpoints, currentPrice);
    
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
