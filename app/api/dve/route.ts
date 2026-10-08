/**
 * Directional Volatility Engine (DVE) API
 *
 * GET /api/dve?symbol=AAPL
 *
 * Computes the engine's DVEReading (cached on the server) and returns only its public projection
 * (lib/research/publicDve, contract public-dve-v1): measured volatility, phase durations, the recorded signal rule and
 * its BBWP conditions, breakout setting conditions, trap/exhaustion observations and the past-case study. The engine's
 * directional pressure, scores, confidences, "probabilities", next-regime guess and price stop are not sent (W3).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { hasPaidSessionAccess } from '@/lib/proTraderAccess';
import {
  detectAssetClass,
  fetchPrice,
  fetchIndicators,
  fetchOptionsSnapshot,
  fetchMPE,
} from '@/lib/goldenEggFetchers';
import { getAggregatedFundingRates, getAggregatedOpenInterest } from '@/lib/coingecko';
import { computeDVE } from '@/lib/directionalVolatilityEngine';
import type { DVEInput } from '@/lib/directionalVolatilityEngine.types';
import type { DVEReading } from '@/lib/directionalVolatilityEngine.types';
import { evaluateDataTrust } from '@/lib/scanner/dataTrust';
import { priceEvidenceFromSeries, type PriceEvidence } from '@/lib/research/priceEvidence';
import { toPublicDveReading } from '@/lib/research/publicDve';
import { PROJECTION } from '@/lib/directionalVolatilityEngine.constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── In-memory cache (3 min) ─────────────────────────────────────────────
type BarAge = { assetClass: 'equity' | 'crypto' | 'forex'; timeframe: string; lastBarAt: string | null; barInterval: string | null };
const dveCache = new Map<string, { data: DVEReading; input: DVEInput; dates: string[] | null; price: number; ts: number; barAge: BarAge; priceEvidence: PriceEvidence | null; optionsRequest: { expiry: string; status: 'used' | 'unavailable' } | null }>();
const DVE_CACHE_TTL = 3 * 60 * 1000;

/**
 * Freshness of the price bars behind a reading, judged by the same session-aware rule as the scanner's data trust
 * (a Saturday view of Friday's equity close is fresh; a daily bar two sessions behind is stale). A cache hit inside the
 * 3-minute TTL is not, by itself, stale: staleness comes from the data's age.
 */
function freshnessMeta(barAge: BarAge, computedAtMs: number) {
  const dataFreshness = evaluateDataTrust({
    assetClass: barAge.assetClass, timeframe: barAge.timeframe, lastBarAt: barAge.lastBarAt, barInterval: barAge.barInterval, price: 1,
  }).freshness;
  return { computedAt: new Date(computedAtMs).toISOString(), dataAsOf: barAge.lastBarAt, dataFreshness };
}

/** Paid, signed-in responses: never stored by a shared or browser cache, and keyed on the session cookie. */
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie' } as const;
const json = (body: unknown, init?: { status?: number }) => NextResponse.json(body, { status: init?.status, headers: PRIVATE_HEADERS });

export async function GET(request: NextRequest) {
  try {
    // 1. Auth + tier check
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return json({ success: false, error: 'Please log in' }, { status: 401 });
    }
    if (!hasPaidSessionAccess(session)) {
      return json({ success: false, error: 'Pro subscription required for Volatility Engine' }, { status: 403 });
    }

    // 2. Parse symbol + timeframe
    const { searchParams } = new URL(request.url);
    const symbol = (searchParams.get('symbol') || '').trim().toUpperCase();
    if (!symbol) {
      return json({ success: false, error: 'Missing symbol parameter' }, { status: 400 });
    }
    const timeframe = (searchParams.get('timeframe') || 'daily').toLowerCase();
    const avIntervalMap: Record<string, string> = { '15m': '15min', '1h': '60min', 'daily': 'daily', 'weekly': 'weekly' };
    const avInterval = avIntervalMap[timeframe] || 'daily';

    // 3. Resolve the asset first: the same ticker can be an equity and a crypto, and they must never share a reading.
    const assetClass = detectAssetClass(symbol, searchParams.get('type') || undefined);
    const expiryParam = searchParams.get('expiry');
    if (expiryParam && !/^\d{4}-\d{2}-\d{2}$/.test(expiryParam)) {
      return json({ success: false, error: 'Invalid expiry (expected YYYY-MM-DD)' }, { status: 400 });
    }
    // Options (and so an expiry) apply to equities only; elsewhere the parameter is ignored and does not split the cache.
    const expiry = assetClass === 'equity' ? expiryParam : null;

    // 4. Cache: everything that changes the reading is in the key.
    const cacheKey = `${symbol}_${timeframe}_${assetClass}_${expiry ?? 'default-expiry'}`;
    const cached = dveCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < DVE_CACHE_TTL) {
      return json({ success: true, data: toPublicDveReading(cached.data, { forwardBars: PROJECTION.FORWARD_BARS, input: cached.input, history: { dates: cached.dates, timeframe }, assetClass }), price: cached.price, priceEvidence: cached.priceEvidence, optionsRequest: cached.optionsRequest ?? undefined, cached: true, ...freshnessMeta(cached.barAge, cached.ts) });
    }

    // 5. Fetch price + MPE in parallel (DVE needs historical data)
    const [priceData, mpeData] = await Promise.all([
      fetchPrice(symbol, assetClass, { requireHistoricals: true, avInterval }),
      fetchMPE(symbol, assetClass),
    ]);

    if (!priceData) {
      return json(
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
      avInterval,
    );

    // 7. Fetch options (equities only)
    let optsData = null;
    if (assetClass === 'equity') {
      optsData = await fetchOptionsSnapshot(symbol, priceData.price, { expiry });
      if (!optsData) {
        console.warn(`[DVE] ${symbol} — options data unavailable (no usable REALTIME_OPTIONS/HISTORICAL_OPTIONS chain)`);
      }
    }

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

    console.log(`[DVE] ${symbol} — closes: ${priceData.historicalCloses.length}, vol: ${priceData.volume}, avgVol: ${priceData.avgVolume}, options: ${optsData ? 'YES' : 'NO'}, gamma: ${optsData?.dealerGamma ?? 'N/A'}`);

    const dveInput: DVEInput = {
      price: {
        closes: priceData.historicalCloses,
        opens: priceData.historicalOpens,
        highs: priceData.historicalHighs,
        lows: priceData.historicalLows,
        currentPrice: priceData.price,
        changePct: priceData.changePct,
        volume: priceData.volume,
        avgVolume: priceData.avgVolume,
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
        inSqueeze: indData.inSqueeze,
        squeezeStrength: indData.squeezeStrength,
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
      liquidity: liqData,
      mpeComposite: mpeData?.composite,
    };

    // 11. Compute DVE (pure, no side effects)
    const reading = computeDVE(dveInput, symbol);

    // 12. Cache + return
    const computedAtMs = Date.now();
    const barAge: BarAge = { assetClass, timeframe, lastBarAt: priceData.lastCompletedBarAt ?? null, barInterval: priceData.barInterval ?? null };
    // The Symbol page's measured values (completed daily bars only, dated) from the same bars, so the two views can be
    // compared on one basis. Daily timeframe only; forex has no evidence definition yet.
    const priceEvidence = timeframe === 'daily' && assetClass !== 'forex' ? priceEvidenceFromSeries(symbol, assetClass, priceData, computedAtMs) : null;
    // An explicit expiry that is not listed leaves options out of the reading (no substitute expiry) and says so.
    const optionsRequest = expiry ? { expiry, status: optsData ? 'used' as const : 'unavailable' as const } : null;
    dveCache.set(cacheKey, { data: reading, input: dveInput, dates: priceData.historicalDates ?? null, price: priceData.price, ts: computedAtMs, barAge, priceEvidence, optionsRequest });
    return json({ success: true, data: toPublicDveReading(reading, { forwardBars: PROJECTION.FORWARD_BARS, input: dveInput, history: { dates: priceData.historicalDates ?? null, timeframe }, assetClass }), price: priceData.price, priceEvidence, optionsRequest: optionsRequest ?? undefined, cached: false, ...freshnessMeta(barAge, computedAtMs) });
  } catch (error) {
    console.error('[DVE API] Error:', error);
    return json(
      // Generic public error: the exception (provider URLs, keys in query strings, stack detail) stays in the server log.
      { success: false, error: 'Volatility reading could not be computed right now.' },
      { status: 500 },
    );
  }
}
