/**
 * Phase 1 · PR-2c — capital-flow confidence and market mode can actually reach their thresholds.
 */
import { describe, expect, it } from 'vitest';
import { computeInstitutionalFlowState, FLOW_STATE_SOFTMAX_TEMPERATURE, type InstitutionalFlowStateInput } from '@/lib/institutional-flow-state-engine';
import { computeCapitalFlowEngine, type CapitalFlowInput } from '@/lib/capitalFlowEngine';

const launchInput = (symbol: string): InstitutionalFlowStateInput => ({
  symbol, marketType: 'equity', bias: 'bullish',
  probabilities: { trend: 100, pin: 0, expansion: 60 },
  probabilityShift: { deltaTrend: 10, deltaExpansion: 0 },
  structure: { trendStructure: 80, vwapSlope: 45, breakoutPressure: 100 },
  liquidity: { currentPrice: 100 },
  volatility: { compressionScore: 0, atrExpansionRate: 100 },
  flow: { flowImbalanceShort: 0, flowImbalanceLong: 0 },
  dataHealth: { freshnessScore: 100 },
});

describe('institutional flow state confidence', () => {
  it('uses a documented temperature so a clean state can clear the 55–75 session minimums', () => {
    expect(FLOW_STATE_SOFTMAX_TEMPERATURE).toBe(0.25);
    const r = computeInstitutionalFlowState(launchInput('TEMP1'));
    expect(r.state).toBe('LAUNCH');
    expect(r.confidence).toBeGreaterThanOrEqual(75); // was ≤ 47.5 by construction
  });
  it('a four-way tie still reads ~25% (no false confidence)', () => {
    const tie = computeInstitutionalFlowState({
      ...launchInput('TIE1'), probabilities: { trend: 0, pin: 0, expansion: 0 },
      structure: { trendStructure: 0, vwapSlope: 45, breakoutPressure: 0 }, volatility: { compressionScore: 0, atrExpansionRate: 0 },
      flow: { flowImbalanceShort: 65, flowImbalanceLong: 0 }, probabilityShift: {},
    });
    const p = tie.stateProbabilities;
    expect(Math.max(p.accumulation, p.positioning, p.launch, p.exhaustion)).toBeLessThan(60);
  });
});

const base = (symbol: string, over: Partial<CapitalFlowInput> = {}): CapitalFlowInput => ({
  symbol, marketType: 'equity', spot: 100, vwap: 99.5, atr: 2,
  dataHealth: { freshness: 'LIVE', fallbackActive: false }, now: new Date('2026-09-24T14:30:00Z'), ...over,
});

describe('capital flow market mode without dealer gamma', () => {
  it('comes from price structure (Wilder ADX), not a hard-wired chop', () => {
    const trend = computeCapitalFlowEngine(base('MM1', { trendMetrics: { adx: 31 } }));
    expect(trend.market_mode).toBe('launch');
    expect(trend.market_mode_basis).toBe('price_structure_adx');
    const range = computeCapitalFlowEngine(base('MM2', { trendMetrics: { adx: 14 } }));
    expect(range.market_mode).toBe('chop');
    expect(range.market_mode_basis).toBe('price_structure_adx');
    const unknown = computeCapitalFlowEngine(base('MM3'));
    expect(unknown.market_mode).toBe('chop');
    expect(unknown.market_mode_basis).toBe('unknown_default_chop');
  });
  it('crypto mode no longer depends on funding', () => {
    const r = computeCapitalFlowEngine(base('MM4', { marketType: 'crypto', trendMetrics: { adx: 40 }, cryptoPositioning: { fundingRate: 0 } }));
    expect(r.market_mode).toBe('launch');
  });
});

describe('crypto funding is contrarian and only at extremes', () => {
  const bias = (fundingRate: number, longShortRatio: number, sym: string) =>
    computeCapitalFlowEngine(base(sym, { marketType: 'crypto', cryptoPositioning: { fundingRate, longShortRatio } })).bias;
  it('normal positive funding is neutral (was bullish)', () => expect(bias(0.01, 1.1, 'F1')).toBe('neutral'));
  it('crowded longs lean bearish, crowded shorts lean bullish (mirrored)', () => {
    expect(bias(0.06, 1.5, 'F2')).toBe('bearish');
    expect(bias(-0.06, 0.6, 'F3')).toBe('bullish');
  });
});
