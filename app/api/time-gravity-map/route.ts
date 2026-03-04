import { NextRequest, NextResponse } from 'next/server';
import { computeTimeGravityMap, type ComputeTGMOptions } from '@/lib/time/timeGravityMap';
import type { MidpointRecord } from '@/lib/time/midpointDebt';
import { getMidpointService } from '@/lib/midpointService';
import { getCandleProcessor, parseCoinGeckoOHLC } from '@/lib/candleProcessor';
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

// ── On-demand midpoint generation cache (prevent parallel fetches) ─────────
const onDemandInFlight = new Map<string, Promise<number>>();

/**
 * Fetch candle data and generate midpoints on-demand for a new symbol.
 * Returns the number of midpoints stored.
 */
async function generateMidpointsOnDemand(symbol: string, assetType: 'crypto' | 'equity'): Promise<number> {
  const key = `${symbol}:${assetType}`;
  const existing = onDemandInFlight.get(key);
  if (existing) return existing;

  const work = (async () => {
    const processor = getCandleProcessor();
    let totalStored = 0;

    if (assetType === 'crypto') {
      // Strip trailing currency suffix for CoinGecko resolution
      const baseSymbol = symbol.replace(/(USD|USDT|USDC|BUSD)$/i, '');
      const coinId = symbolToId(baseSymbol) || await resolveSymbolToId(baseSymbol);
      if (!coinId) {
        console.warn(`[TGM on-demand] Could not resolve CoinGecko ID for ${symbol}`);
        return 0;
      }

      // Fetch 30-day daily OHLC (gives ~30 candles)
      const ohlc30 = await getOHLC(coinId, 30);
      if (ohlc30 && ohlc30.length > 0) {
        const bars30 = parseCoinGeckoOHLC(ohlc30 as [number, number, number, number, number][]);
        totalStored += await processor.processCandleBatch(symbol, 'daily', bars30, 'crypto');
      }

      // Fetch 1-day OHLC (gives ~288 5-min candles → compressed to ~24 1H candles)
      const ohlc1 = await getOHLC(coinId, 1);
      if (ohlc1 && ohlc1.length > 0) {
        const bars1 = parseCoinGeckoOHLC(ohlc1 as [number, number, number, number, number][]);
        totalStored += await processor.processCandleBatch(symbol, '30min', bars1, 'crypto');
      }

      console.log(`[TGM on-demand] Generated ${totalStored} midpoints for crypto ${symbol} (coinId: ${coinId})`);
    } else {
      // Equity: fetch daily bars from Alpha Vantage
      const canFetch = await avTryToken();
      if (!canFetch) {
        console.warn(`[TGM on-demand] AV rate limit hit, skipping ${symbol}`);
        return 0;
      }

      const apiKey = process.env.ALPHA_VANTAGE_API_KEY || '';
      const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&outputsize=compact&entitlement=realtime&apikey=${apiKey}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return 0;

      const json = await res.json();
      if (json['Error Message'] || json['Note']) return 0;

      const tsKey = Object.keys(json).find(k => k.startsWith('Time Series'));
      if (!tsKey || !json[tsKey]) return 0;

      const timeSeries = json[tsKey];
      const avBars = Object.entries(timeSeries)
        .map(([ts, v]: [string, any]) => ({
          time: new Date(ts),
          open: parseFloat(v['1. open']),
          high: parseFloat(v['2. high']),
          low: parseFloat(v['3. low']),
          close: parseFloat(v['4. close']),
          volume: parseInt(v['5. volume'] || '0', 10),
        }))
        .sort((a, b) => a.time.getTime() - b.time.getTime())
        .slice(-30); // Last 30 days

      totalStored = await processor.processCandleBatch(symbol, 'daily', avBars, 'equity');
      console.log(`[TGM on-demand] Generated ${totalStored} midpoints for equity ${symbol}`);
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

    return totalStored;
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
    
    if (!symbol) {
      return NextResponse.json(
        { error: 'Missing required parameter: symbol' },
        { status: 400 }
      );
    }
    
    if (!priceStr) {
      return NextResponse.json(
        { error: 'Missing required parameter: price' },
        { status: 400 }
      );
    }
    
    const currentPrice = parseFloat(priceStr);
    
    if (isNaN(currentPrice) || currentPrice <= 0) {
      return NextResponse.json(
        { error: 'Invalid price value' },
        { status: 400 }
      );
    }
    
    let midpoints: MidpointRecord[] = [];
    
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

        // ── ON-DEMAND: No midpoints in DB → fetch candles & generate ──
        if (midpoints.length === 0) {
          const assetType = isCryptoSymbol(symbol) ? 'crypto' : 'equity';
          console.log(`[TGM API] No midpoints for ${symbol}, generating on-demand (${assetType})...`);
          const generated = await generateMidpointsOnDemand(symbol, assetType);
          if (generated > 0) {
            // Re-fetch the freshly stored midpoints
            midpoints = await service.getUntaggedMidpoints(symbol, currentPrice, {
              maxDistancePercent: maxDistance,
              limit: 100,
            });
            console.log(`[TGM API] On-demand: ${generated} stored, ${midpoints.length} within range for ${symbol}`);
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
    
    // Return full TGM data
    return NextResponse.json({
      success: true,
      symbol,
      timestamp: new Date().toISOString(),
      dataSource,
      midpointCount: midpoints.length,
      targetStatus: tgm.targetStatus,
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
