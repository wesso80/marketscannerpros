/**
 * Layer 2 — Discovery Engine
 * @internal — NEVER import into user-facing components.
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

import type { DiscoveryCandidate, ScanTimeframe } from './types';
import { getBulkCachedScanData, type CachedScanData } from '@/lib/scannerCache';
import { getBulkIntradayScanData, type IntradayInterval } from './intradayFetcher';
import { computeDirectionalPressure } from '@/lib/directionalVolatilityEngine';
import { computeCapitalFlowEngine, type CapitalFlowInput } from '@/lib/capitalFlowEngine';
import { computeInstitutionalFilter } from '@/lib/institutionalFilter';
import { getTimeConfluenceState } from '@/lib/time-confluence';
import { computeMarketPressure } from '@/lib/marketPressureEngine';
import { checkCatalystProximity } from './catalystGate';

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
  timeframe?: ScanTimeframe;
}

export async function runDiscovery(
  options: DiscoveryOptions = {},
): Promise<DiscoveryCandidate[]> {
  const assetTypes = options.assetTypes ?? ['equity', 'crypto'];
  const timeframe = options.timeframe ?? 'daily';
  const candidates: DiscoveryCandidate[] = [];

  for (const assetType of assetTypes) {
    const universe = assetType === 'equity' ? EQUITY_UNIVERSE : CRYPTO_UNIVERSE;

    // Fetch data — intraday uses AV TIME_SERIES_INTRADAY (equity) or CRYPTO_INTRADAY (crypto)
    let cachedData: Map<string, CachedScanData>;
    try {
      if (timeframe !== 'daily') {
        const interval: IntradayInterval = timeframe === '15min' ? '15min' : '60min';
        cachedData = await getBulkIntradayScanData(universe, interval, assetType);
      } else {
        cachedData = await getBulkCachedScanData(universe);
      }
    } catch {
      console.warn(`[quant:discovery] Failed to fetch ${timeframe} data for ${assetType}`);
      continue;
    }

    for (const symbol of universe) {
      const data = cachedData.get(symbol);
      if (!data || !data.price) continue;

      const candidate = buildCandidateFromCache(symbol, data, assetType);
      candidates.push(candidate);
    }
  }

  // ─── V2 Enrichment Pass ─────────────────────────────────────────────────
  // Time Confluence — computed once (purely time-based, no per-symbol data)
  let tcSnapshot: DiscoveryCandidate['timeConfluence'];
  try {
    const tc = getTimeConfluenceState();
    tcSnapshot = {
      confluenceScore: tc.nowConfluenceScore ?? 0,
      activeTFCount: tc.nowClosing?.length ?? 0,
      decompressionCount: tc.decompressionCount ?? 0,
      hotZoneActive: (tc.nowConfluenceScore ?? 0) >= 70,
      nowImpact: tc.nowImpact ?? 'low',
      minutesToNextMajor: tc.minutesToNextMajor ?? 999,
    };
  } catch {
    // Time confluence unavailable — continue without it
  }

  // Market Pressure — per-symbol enrichment
  for (const candidate of candidates) {
    // Attach shared time confluence snapshot to every candidate
    if (tcSnapshot) {
      candidate.timeConfluence = tcSnapshot;
    }

    // MPE enrichment
    try {
      const mpeResult = computeMarketPressure({
        symbol: candidate.symbol,
        assetClass: candidate.assetType,
        time: tcSnapshot ? {
          confluenceScore: tcSnapshot.confluenceScore,
          activeTFCount: tcSnapshot.activeTFCount,
          hotZoneActive: tcSnapshot.hotZoneActive,
        } : undefined,
        volatility: candidate.indicators.atrPercent != null ? {
          atrPercent: candidate.indicators.atrPercent,
          adx: candidate.indicators.adx ?? 0,
        } : undefined,
      });
      candidate.pressure = {
        composite: mpeResult.composite,
        direction: mpeResult.direction,
        alignment: mpeResult.alignment,
        label: mpeResult.label,
        components: {
          time: mpeResult.pressures.time.score,
          volatility: mpeResult.pressures.volatility.score,
          liquidity: mpeResult.pressures.liquidity.score,
          options: mpeResult.pressures.options.score,
        },
      };
    } catch {
      // MPE enrichment failed — continue without it
    }
  }

  // Catalyst proximity — equity only, batch check
  const equitySymbols = candidates
    .filter(c => c.assetType === 'equity')
    .map(c => c.symbol);

  if (equitySymbols.length > 0) {
    try {
      const catalystMap = await checkCatalystProximity(equitySymbols);
      for (const candidate of candidates) {
        if (candidate.assetType !== 'equity') continue;
        const prox = catalystMap.get(candidate.symbol);
        if (prox) {
          candidate.catalystProximity = prox;
        }
      }
    } catch {
      // Catalyst check failed — continue without it
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
