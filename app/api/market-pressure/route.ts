/**
 * Market Pressure Engine API
 *
 * GET /api/market-pressure?symbol=BTCUSD
 *
 * Aggregates Time, Volatility, Liquidity, and Options pressure data from
 * live data sources and returns a unified composite reading.
 *
 * All data is fetched directly from source functions — no HTTP round-trips.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { computeMarketPressure, type MarketPressureInput, type TimePressureInput, type VolatilityPressureInput, type LiquidityPressureInput, type OptionsPressureInput } from '@/lib/marketPressureEngine';
import { confluenceLearningAgent, type ScanMode, type SessionMode } from '@/lib/confluence-learning-agent';
import { classifyRegime } from '@/lib/regime-classifier';
import { getIndicators } from '@/lib/onDemandFetch';
import { getAggregatedFundingRates, getAggregatedOpenInterest } from '@/lib/coingecko';
import { optionsAnalyzer } from '@/lib/options-confluence-analyzer';
import { calculateDealerGammaSnapshot } from '@/lib/options-gex';
import { hasProTraderAccess } from '@/lib/proTraderAccess';

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

    // ── 1. TIME PRESSURE — live from confluence scan ────────────────
    const timePressure: Partial<TimePressureInput> = {};
    try {
      const scanResult = await confluenceLearningAgent.scanHierarchical(symbol, scanMode, sessionMode);
      if (scanResult) {
        timePressure.confluenceScore = scanResult.prediction?.confidence ?? 0;
        timePressure.activeTFCount = scanResult.scoreBreakdown?.activeTFs ?? 0;
        timePressure.decompressionActiveCount = scanResult.decompression?.activeCount ?? 0;
        timePressure.midpointDebtCount = Array.isArray(scanResult.mid50Levels)
          ? scanResult.mid50Levels.length
          : 0;
        timePressure.hotZoneActive = (timePressure.activeTFCount ?? 0) >= 3;
      }
    } catch (err) {
      console.warn(`[MPE] Time pressure failed for ${symbol}:`, (err as Error).message);
    }

    // ── 2. VOLATILITY PRESSURE — live from AV indicators + regime ───
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

    // ── 3. LIQUIDITY PRESSURE — live from CoinGecko (crypto only) ──
    const liqPressure: Partial<LiquidityPressureInput> = {};
    if (assetClass === 'crypto') {
      try {
        const baseSymbol = symbol.replace(/(USD|USDT|USDC|BUSD)$/i, '').toUpperCase();
        const symbols = [baseSymbol];

        const [fundingData, oiData] = await Promise.all([
          getAggregatedFundingRates(symbols),
          getAggregatedOpenInterest(symbols),
        ]);

        // Funding rates — live from CoinGecko derivatives
        if (fundingData && fundingData.length > 0) {
          const coin = fundingData.find(c => c.symbol.toUpperCase() === baseSymbol);
          if (coin) {
            liqPressure.fundingRatePercent = coin.fundingRatePercent ?? 0;
            liqPressure.fundingAnnualized = coin.annualized ?? 0;
            liqPressure.fundingSentiment = coin.sentiment ?? 'Neutral';
          } else {
            // Fallback: average of all returned symbols
            const avgRate = fundingData.reduce((s, r) => s + r.fundingRatePercent, 0) / fundingData.length;
            const avgAnn = fundingData.reduce((s, r) => s + r.annualized, 0) / fundingData.length;
            liqPressure.fundingRatePercent = avgRate;
            liqPressure.fundingAnnualized = avgAnn;
            liqPressure.fundingSentiment = avgRate > 0.02 ? 'Bullish' : avgRate < -0.01 ? 'Bearish' : 'Neutral';
          }
        }

        // Open interest — live from CoinGecko derivatives
        if (oiData && oiData.length > 0) {
          const coinOI = oiData.find(c => c.symbol.toUpperCase() === baseSymbol);
          if (coinOI) {
            liqPressure.oiTotalUsd = coinOI.totalOpenInterest ?? 0;
            // CoinGecko doesn't provide 24h change directly — set 0 (no anchor comparison)
            liqPressure.oi24hChangePct = 0;
            liqPressure.oiSignal = 'neutral';
          }
        }
      } catch (err) {
        console.warn(`[MPE] Liquidity pressure failed for ${symbol}:`, (err as Error).message);
      }
    }

    // ── 4. OPTIONS PRESSURE — live from Alpha Vantage (equity only) ─
    const optPressure: Partial<OptionsPressureInput> = {};
    if (assetClass === 'equity' && hasProTraderAccess(session.tier)) {
      try {
        const analysis = await optionsAnalyzer.analyzeForOptions(symbol, scanMode);

        // GEX from dealer gamma snapshot
        if (analysis.openInterestAnalysis) {
          const snapshot = calculateDealerGammaSnapshot(
            analysis.openInterestAnalysis,
            analysis.currentPrice,
          );
          optPressure.gexRegime = snapshot.regime ?? 'NEUTRAL';
          optPressure.netGexUsd = snapshot.netGexUsd ?? 0;
          optPressure.gammaFlipPrice = snapshot.gammaFlipPrice ?? undefined;
          optPressure.gammaFlipDistancePct = snapshot.flipDistancePct ?? undefined;

          // Open interest metrics
          optPressure.putCallRatio = analysis.openInterestAnalysis.pcRatio ?? 1.0;
          optPressure.maxPainStrike = analysis.openInterestAnalysis.maxPainStrike ?? undefined;
        }

        // Unusual activity detection
        if (analysis.unusualActivity) {
          optPressure.unusualActivityDetected = analysis.unusualActivity.hasUnusualActivity ?? false;
          optPressure.smartMoneyBias = analysis.unusualActivity.smartMoneyDirection ?? 'neutral';
        }

        // IV analysis
        if (analysis.ivAnalysis) {
          optPressure.ivRank = analysis.ivAnalysis.ivRank ?? undefined;
          volPressure.ivRank = analysis.ivAnalysis.ivRank ?? undefined;
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
