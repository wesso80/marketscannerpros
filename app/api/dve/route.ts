/**
 * Directional Volatility Engine (DVE) API
 *
 * GET /api/dve?symbol=AAPL
 *
 * Returns a DVEReading with 5-layer volatility analysis:
 *   Layer 1: Volatility State (BBWP, regime, VHM)
 *   Layer 2: Directional Bias (stochastic momentum + confluence)
 *   Layer 3: Phase Persistence (contraction/expansion age + continuation odds)
 *   Layer 4: Signal Triggering (compression release, expansion continuation, etc.)
 *   Layer 5: Outcome Projection (magnitude, forward estimates, invalidation)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { hasProTraderAccess } from '@/lib/proTraderAccess';
import {
  detectAssetClass,
  fetchPrice,
  fetchIndicators,
  fetchOptionsSnapshot,
  fetchMPE,
} from '@/lib/goldenEggFetchers';
import { confluenceLearningAgent } from '@/lib/confluence-learning-agent';
import { getAggregatedFundingRates, getAggregatedOpenInterest } from '@/lib/coingecko';
import { computeDVE } from '@/lib/directionalVolatilityEngine';
import type { DVEInput } from '@/lib/directionalVolatilityEngine.types';
import type { DVEReading } from '@/lib/directionalVolatilityEngine.types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── In-memory cache (3 min) ─────────────────────────────────────────────
const dveCache = new Map<string, { data: DVEReading; ts: number }>();
const DVE_CACHE_TTL = 3 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    // 1. Auth + tier check
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ success: false, error: 'Please log in' }, { status: 401 });
    }
    if (!hasProTraderAccess(session.tier)) {
      return NextResponse.json({ success: false, error: 'Pro Trader subscription required' }, { status: 403 });
    }

    // 2. Parse symbol
    const { searchParams } = new URL(request.url);
    const symbol = (searchParams.get('symbol') || '').trim().toUpperCase();
    if (!symbol) {
      return NextResponse.json({ success: false, error: 'Missing symbol parameter' }, { status: 400 });
    }

    // 3. Check cache
    const cached = dveCache.get(symbol);
    if (cached && Date.now() - cached.ts < DVE_CACHE_TTL) {
      return NextResponse.json({ success: true, data: cached.data, cached: true });
    }

    // 4. Detect asset class
    const assetClass = detectAssetClass(symbol);

    // 5. Fetch price + MPE in parallel (DVE needs historical data)
    const [priceData, mpeData] = await Promise.all([
      fetchPrice(symbol, assetClass, { requireHistoricals: true }),
      fetchMPE(symbol, assetClass),
    ]);

    if (!priceData) {
      return NextResponse.json(
        { success: false, error: `Unable to fetch price data for ${symbol}` },
        { status: 404 },
      );
    }

    // 6. Fetch indicators (after price to space out AV calls)
    const indData = await fetchIndicators(
      symbol, assetClass,
      priceData.historicalCloses,
      priceData.historicalHighs,
      priceData.historicalLows,
    );

    // 7. Fetch options (equities only)
    let optsData = null;
    if (assetClass === 'equity') {
      optsData = await fetchOptionsSnapshot(symbol, priceData.price);
    }

    // 8. Fetch time data
    let timeData: DVEInput['time'] = undefined;
    try {
      const scan = await confluenceLearningAgent.scanHierarchical(
        symbol, 'intraday_1h', 'extended',
      );
      if (scan) {
        timeData = {
          activeTFCount: scan.scoreBreakdown?.activeTFs ?? 0,
          hotZoneActive: (scan.scoreBreakdown?.activeTFs ?? 0) >= 3,
          confluenceScore: scan.prediction?.confidence ?? 0,
        };
      }
    } catch { /* time data is optional */ }

    // 9. Fetch liquidity (crypto only)
    let liqData: DVEInput['liquidity'] = undefined;
    if (assetClass === 'crypto') {
      try {
        const sym = symbol.toUpperCase().replace(/USD[T]?$/, '');
        const [funding, oi] = await Promise.all([
          getAggregatedFundingRates([sym]),
          getAggregatedOpenInterest([sym]),
        ]);
        const fundEntry = funding?.find((f) => f.symbol?.toUpperCase()?.includes(sym));
        const oiEntry = oi?.find((o) => o.symbol?.toUpperCase()?.includes(sym));
        liqData = {
          fundingRatePercent: fundEntry?.fundingRatePercent,
          oiTotalUsd: oiEntry?.totalOpenInterest,
          fundingSentiment: fundEntry?.sentiment,
        };
      } catch { /* liquidity is optional */ }
    }

    // 10. Assemble DVEInput
    const stochK = indData?.stochK ?? null;
    const stochD = indData?.stochD ?? null;

    const dveInput: DVEInput = {
      price: {
        closes: priceData.historicalCloses,
        highs: priceData.historicalHighs,
        lows: priceData.historicalLows,
        currentPrice: priceData.price,
        changePct: priceData.changePct,
        volume: priceData.volume,
      },
      indicators: indData ? {
        macd: indData.macd,
        macdHist: indData.macdHist,
        macdSignal: indData.macdSignal,
        adx: indData.adx,
        atr: indData.atr,
        sma20: indData.sma20,
        sma50: indData.sma50,
        bbUpper: indData.bbUpper,
        bbMiddle: indData.bbMiddle,
        bbLower: indData.bbLower,
        stochK,
        stochD,
        stochMomentum: (stochK != null && stochD != null) ? stochK - stochD : null,
      } : undefined,
      options: optsData ? {
        putCallRatio: optsData.putCallRatio,
        ivRank: optsData.ivRank,
        dealerGamma: optsData.dealerGamma,
        maxPain: optsData.maxPain,
        highestOICallStrike: optsData.highestOICallStrike,
        highestOIPutStrike: optsData.highestOIPutStrike,
        unusualActivity: optsData.unusualActivity,
        sentiment: optsData.sentiment,
      } : undefined,
      time: timeData,
      liquidity: liqData,
      mpeComposite: mpeData?.composite,
    };

    // 11. Compute DVE (pure, no side effects)
    const reading = computeDVE(dveInput, symbol);

    // 12. Cache + return
    dveCache.set(symbol, { data: reading, ts: Date.now() });
    return NextResponse.json({ success: true, data: reading });
  } catch (error) {
    console.error('[DVE API] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'DVE analysis failed' },
      { status: 500 },
    );
  }
}
