/**
 * Market Pressure Engine API
 *
 * GET /api/market-pressure?symbol=BTCUSD
 *
 * Aggregates Time, Volatility, Liquidity, and Options pressure data from
 * existing platform sources and returns a unified composite reading.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { computeMarketPressure, type MarketPressureInput, type TimePressureInput, type VolatilityPressureInput, type LiquidityPressureInput, type OptionsPressureInput } from '@/lib/marketPressureEngine';
import { confluenceLearningAgent, type ScanMode, type SessionMode } from '@/lib/confluence-learning-agent';
import { classifyRegime } from '@/lib/regime-classifier';
import { getIndicators } from '@/lib/onDemandFetch';

// ── Asset class detection ──────────────────────────────────────────────
const CRYPTO_SUFFIXES = ['USD', 'USDT', 'USDC', 'BTC', 'ETH', 'BUSD'];
const KNOWN_CRYPTO = ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT', 'AVAX', 'MATIC', 'LINK', 'UNI', 'ATOM', 'BNB'];
function isCrypto(symbol: string): boolean {
  const upper = symbol.toUpperCase();
  if (CRYPTO_SUFFIXES.some(s => upper.endsWith(s) && upper.length > s.length)) return true;
  if (KNOWN_CRYPTO.includes(upper)) return true;
  return false;
}

// ── Simple in-memory cache (5 min) ────────────────────────────────────
const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ success: false, error: 'Please log in' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const symbol = (searchParams.get('symbol') || '').trim().toUpperCase();
    if (!symbol) {
      return NextResponse.json({ success: false, error: 'Missing symbol parameter' }, { status: 400 });
    }

    const scanMode = (searchParams.get('scanMode') || 'intraday_1h') as ScanMode;
    const sessionMode = (searchParams.get('sessionMode') || 'extended') as SessionMode;

    // Check cache
    const cacheKey = `mpe:${symbol}:${scanMode}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json({ success: true, ...cached.data, cached: true });
    }

    const assetClass = isCrypto(symbol) ? 'crypto' : 'equity';

    // ── 1. TIME PRESSURE — from confluence scan ─────────────────────
    const timePressure: Partial<TimePressureInput> = {};
    try {
      const scanResult = await confluenceLearningAgent.scanHierarchical(symbol, scanMode, sessionMode);
      if (scanResult) {
        // prediction.confidence is the composite time-confluence score
        timePressure.confluenceScore = scanResult.prediction?.confidence ?? 0;
        // scoreBreakdown.activeTFs counts how many TFs are contributing
        timePressure.activeTFCount = scanResult.scoreBreakdown?.activeTFs ?? 0;
        // Decompression active count from the analysis object
        timePressure.decompressionActiveCount = scanResult.decompression?.activeCount ?? 0;
        // Midpoint debt from mid50 levels
        timePressure.midpointDebtCount = Array.isArray(scanResult.mid50Levels)
          ? scanResult.mid50Levels.length
          : 0;
        timePressure.hotZoneActive = (timePressure.activeTFCount ?? 0) >= 3;
      }
    } catch (err) {
      console.warn(`[MPE] Time pressure failed for ${symbol}:`, (err as Error).message);
    }

    // ── 2. VOLATILITY PRESSURE — from indicators + regime ───────────
    const volPressure: Partial<VolatilityPressureInput> = {};
    try {
      const indRow = await getIndicators(symbol, 'daily');
      if (indRow) {
        const regime = classifyRegime({
          adx: indRow.adx14 ?? undefined,
          rsi: indRow.rsi14 ?? undefined,
          atrPercent: indRow.atrPercent14 ?? undefined,
          direction: indRow.ema9 && indRow.ema20
            ? (indRow.ema9 > indRow.ema20 ? 'bullish' : indRow.ema9 < indRow.ema20 ? 'bearish' : 'neutral')
            : undefined,
        });
        volPressure.regimeState = regime.governor;
        volPressure.regimeConfidence = regime.confidence;
        volPressure.atrPercent = indRow.atrPercent14 ?? 0;
        volPressure.adx = indRow.adx14 ?? 0;
        volPressure.inSqueeze = indRow.inSqueeze ?? false;
        volPressure.squeezeStrength = indRow.squeezeStrength ?? 0;
      }
    } catch (err) {
      console.warn(`[MPE] Volatility pressure failed for ${symbol}:`, (err as Error).message);
    }

    // ── 3. LIQUIDITY PRESSURE — from funding/OI/L-S (crypto only) ──
    const liqPressure: Partial<LiquidityPressureInput> = {};
    if (assetClass === 'crypto') {
      try {
        const [fundingData, oiData] = await Promise.all([
          fetchJSON(`/api/funding-rates`, request),
          fetchJSON(`/api/crypto/open-interest?symbol=${encodeURIComponent(symbol)}`, request),
        ]);

        if (fundingData) {
          // Find this symbol in funding data
          const baseSymbol = symbol.replace(/(USD|USDT|USDC|BUSD)$/i, '').toUpperCase();
          const coin = fundingData.coins?.find((c: any) =>
            c.symbol?.toUpperCase().startsWith(baseSymbol)
          );
          if (coin) {
            liqPressure.fundingRatePercent = coin.fundingRatePercent ?? 0;
            liqPressure.fundingAnnualized = coin.annualized ?? 0;
            liqPressure.fundingSentiment = coin.sentiment ?? 'Neutral';
          } else if (fundingData.average) {
            liqPressure.fundingRatePercent = fundingData.average.fundingRatePercent ?? 0;
            liqPressure.fundingAnnualized = fundingData.average.annualized ?? 0;
            liqPressure.fundingSentiment = fundingData.average.sentiment ?? 'Neutral';
          }
        }

        if (oiData) {
          liqPressure.oiTotalUsd = oiData.openInterest ?? 0;
          liqPressure.oi24hChangePct = oiData.change24h ?? 0;
          liqPressure.oiSignal = oiData.signal ?? 'neutral';
          liqPressure.longShortRatio = oiData.longShortRatio ?? 1.0;
        }
      } catch (err) {
        console.warn(`[MPE] Liquidity pressure failed for ${symbol}:`, (err as Error).message);
      }
    }

    // ── 4. OPTIONS PRESSURE — GEX + options scan (equity only) ──────
    const optPressure: Partial<OptionsPressureInput> = {};
    if (assetClass === 'equity') {
      try {
        const gexData = await fetchJSON(
          `/api/options/gex?symbol=${encodeURIComponent(symbol)}&scanMode=${scanMode}`,
          request
        );
        if (gexData?.snapshot) {
          const snap = gexData.snapshot;
          optPressure.gexRegime = snap.regime ?? 'NEUTRAL';
          optPressure.netGexUsd = snap.netGexUsd ?? 0;
          optPressure.gammaFlipPrice = snap.gammaFlipPrice ?? undefined;
          optPressure.gammaFlipDistancePct = snap.flipDistancePct ?? undefined;
        }
        if (gexData?.openInterest) {
          const oi = gexData.openInterest;
          optPressure.putCallRatio = oi.pcRatio ?? 1.0;
          optPressure.maxPainStrike = oi.maxPainStrike ?? undefined;
        }
        if (gexData?.unusualActivity) {
          optPressure.unusualActivityDetected = gexData.unusualActivity.hasUnusualActivity ?? false;
          optPressure.smartMoneyBias = gexData.unusualActivity.smartMoneyDirection ?? 'neutral';
        }
        if (gexData?.ivAnalysis) {
          optPressure.ivRank = gexData.ivAnalysis.ivRank ?? undefined;
          volPressure.ivRank = gexData.ivAnalysis.ivRank ?? undefined;
        }
      } catch (err) {
        console.warn(`[MPE] Options pressure failed for ${symbol}:`, (err as Error).message);
      }
    }

    // ── COMPUTE MPE ─────────────────────────────────────────────────
    const mpeInput: MarketPressureInput = {
      symbol,
      assetClass,
      time: timePressure,
      volatility: volPressure,
      liquidity: liqPressure,
      options: optPressure,
    };

    const reading = computeMarketPressure(mpeInput);

    const result = {
      success: true,
      symbol,
      assetClass,
      reading,
      dataSources: {
        time: Object.keys(timePressure).length > 0,
        volatility: Object.keys(volPressure).length > 0,
        liquidity: Object.keys(liqPressure).length > 0,
        options: Object.keys(optPressure).length > 0,
      },
    };

    cache.set(cacheKey, { data: result, ts: Date.now() });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[MPE] Error:', err);
    return NextResponse.json(
      { success: false, error: 'Market Pressure Engine error' },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/** Fetch JSON from an internal API route (reusing the request's cookies) */
async function fetchJSON(path: string, originalRequest: NextRequest) {
  try {
    const origin = new URL(originalRequest.url).origin;
    const url = path.startsWith('http') ? path : `${origin}${path}`;
    const res = await fetch(url, {
      headers: {
        cookie: originalRequest.headers.get('cookie') || '',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.success === false ? null : json;
  } catch {
    return null;
  }
}
