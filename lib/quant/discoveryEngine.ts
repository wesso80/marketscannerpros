/**
 * Layer 2 — Discovery Engine
 *
 * Multi-symbol scanner that pipes each candidate through available engines:
 *   - Scanner indicators (RSI, MACD, ADX, Stoch, etc.)
 *   - DVE (BBWP, directional pressure, signal detection)
 *   - Institutional Flow State
 *   - Capital Flow Engine
 *   - Institutional Filter (grade)
 *
 * Returns DiscoveryCandidate[] — raw, un-fused data per symbol.
 * The orchestrator feeds these into the Fusion Engine next.
 */

import type { DiscoveryCandidate } from './types';
import { getBulkCachedScanData, type CachedScanData } from '@/lib/scannerCache';
import { computeDirectionalPressure } from '@/lib/directionalVolatilityEngine';
import { computeCapitalFlowEngine, type CapitalFlowInput } from '@/lib/capitalFlowEngine';
import { computeInstitutionalFilter } from '@/lib/institutionalFilter';

// ─── Universe ───────────────────────────────────────────────────────────────

export const EQUITY_UNIVERSE = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'AVGO', 'ORCL', 'CRM',
  'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'BLK',
  'UNH', 'JNJ', 'LLY', 'PFE', 'ABBV', 'MRK',
  'WMT', 'PG', 'KO', 'PEP', 'COST', 'MCD', 'NKE', 'HD',
  'CAT', 'DE', 'UPS', 'BA', 'HON', 'GE',
  'XOM', 'CVX', 'COP', 'SLB',
  'AMD', 'INTC', 'QCOM', 'MU', 'AMAT',
  'NFLX', 'UBER', 'ABNB', 'SQ', 'SHOP', 'SNOW', 'PLTR', 'CRWD',
  'DIS', 'PYPL', 'ADBE', 'NOW', 'INTU',
];

export const CRYPTO_UNIVERSE = [
  'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'AVAX', 'LINK', 'DOT',
  'MATIC', 'SHIB', 'LTC', 'UNI', 'XLM', 'NEAR', 'ATOM', 'APT',
  'ARB', 'OP', 'FIL', 'INJ', 'AAVE', 'GRT', 'FTM',
  'SUI', 'SEI', 'TIA', 'RUNE', 'STX', 'PENDLE', 'JUP', 'ONDO', 'PYTH',
];

// ─── Build Discovery Candidate from cached scan data ────────────────────────

function buildCandidateFromCache(
  symbol: string,
  data: CachedScanData,
  assetType: 'equity' | 'crypto',
): DiscoveryCandidate {
  const candidate: DiscoveryCandidate = {
    symbol,
    assetType,
    scanTimestamp: new Date().toISOString(),
    indicators: {
      price: data.price,
      rsi: data.rsi,
      macd: data.macdLine ? { value: data.macdLine, signal: data.macdSignal, histogram: data.macdHist } : undefined,
      adx: data.adx,
      atr: data.atr,
      atrPercent: data.atrPercent,
      stochK: data.stochK,
      ema200: data.ema200,
      vwap: data.vwap,
      volume: data.volume,
    },
  };

  // DVE enrichment — directional pressure from available indicators
  try {
    const dveInput = {
      indicators: {
        stochK: data.stochK ?? null,
        stochD: data.stochD ?? null,
        macd: data.macdLine ?? null,
        macdSignal: data.macdSignal ?? null,
        macdHist: data.macdHist ?? null,
        sma20: null,
        sma50: null,
        adx: data.adx ?? null,
        atr: data.atr ?? null,
      },
      options: {},
      liquidity: {},
      price: {
        closes: [data.price],
        currentPrice: data.price,
        changePct: 0,
        volume: data.volume ?? 0,
      },
    };

    const dirPressure = computeDirectionalPressure(dveInput);

    candidate.dve = {
      bbwp: 0, // Not available without close series
      regime: 'neutral',
      signal: 'none',
      signalStrength: 0,
      directionalBias: dirPressure.bias,
      directionalScore: dirPressure.score,
    };
  } catch {
    // DVE enrichment failed — continue without it
  }

  // Capital Flow enrichment
  try {
    const cfInput: CapitalFlowInput = {
      symbol,
      marketType: assetType,
      spot: data.price,
      vwap: data.vwap,
      atr: data.atr,
    };
    const cfResult = computeCapitalFlowEngine(cfInput);
    candidate.capitalFlow = {
      mode: cfResult.market_mode,
      bias: cfResult.bias,
      conviction: cfResult.conviction,
      gammaState: cfResult.gamma_state,
    };

    // Institutional Flow State from capital flow
    if (cfResult.flow_state) {
      candidate.flowState = {
        state: cfResult.flow_state.state,
        confidence: cfResult.flow_state.confidence,
        bias: cfResult.flow_state.bias,
      };
    }
  } catch {
    // Capital flow enrichment failed — continue
  }

  // Institutional Filter grade
  try {
    const filterResult = computeInstitutionalFilter({
      baseScore: 50,
      strategy: 'momentum',
      regime: 'unknown',
      volatility: { atrPercent: data.atrPercent },
      dataHealth: { freshness: 'CACHED' },
    });
    candidate.institutionalGrade = {
      grade: filterResult.finalGrade,
      score: filterResult.finalScore,
      recommendation: filterResult.recommendation,
    };
  } catch {
    // Filter enrichment failed — continue
  }

  return candidate;
}

// ─── Main Discovery Function ────────────────────────────────────────────────

export interface DiscoveryOptions {
  assetTypes?: ('equity' | 'crypto')[];
  maxSymbols?: number;
}

export async function runDiscovery(
  options: DiscoveryOptions = {},
): Promise<DiscoveryCandidate[]> {
  const assetTypes = options.assetTypes ?? ['equity', 'crypto'];
  const candidates: DiscoveryCandidate[] = [];

  for (const assetType of assetTypes) {
    const universe = assetType === 'equity' ? EQUITY_UNIVERSE : CRYPTO_UNIVERSE;

    // Fetch cached scan data for all symbols
    let cachedData: Map<string, CachedScanData>;
    try {
      cachedData = await getBulkCachedScanData(universe);
    } catch {
      console.warn(`[quant:discovery] Failed to fetch cached data for ${assetType}`);
      continue;
    }

    for (const symbol of universe) {
      const data = cachedData.get(symbol);
      if (!data || !data.price) continue;

      const candidate = buildCandidateFromCache(symbol, data, assetType);
      candidates.push(candidate);
    }
  }

  // Sort by potential interest: DVE signal strength + directional score + institutional grade
  candidates.sort((a, b) => {
    const scoreA = (a.dve?.signalStrength ?? 0) + Math.abs(a.dve?.directionalScore ?? 0) * 0.5 + (a.institutionalGrade?.score ?? 0) * 0.3;
    const scoreB = (b.dve?.signalStrength ?? 0) + Math.abs(b.dve?.directionalScore ?? 0) * 0.5 + (b.institutionalGrade?.score ?? 0) * 0.3;
    return scoreB - scoreA;
  });

  const maxSymbols = options.maxSymbols ?? 100;
  return candidates.slice(0, maxSymbols);
}
