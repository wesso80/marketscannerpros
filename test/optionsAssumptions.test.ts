import { describe, expect, it } from 'vitest';
import { computeDirectionalPressure } from '../lib/directionalVolatilityEngine';
import { assessOptionsChainQuality } from '../lib/options/dataQuality';
import { buildDealerIntelligence, calculateDealerGammaSnapshot } from '../lib/options-gex';
import { scoreOptionCandidatesV21WithDiagnostics } from '../lib/scoring/options-v21';

function expiryIn(days: number) {
  const date = new Date(Date.now() + days * 86_400_000);
  return date.toISOString().slice(0, 10);
}

function baseScoreInput(overrides: Partial<Parameters<typeof scoreOptionCandidatesV21WithDiagnostics>[0]> = {}) {
  return {
    symbol: 'SPY',
    timeframe: 'intraday_1h',
    spot: 100,
    expectedMovePct: 4,
    ivRank: 45,
    marketDirection: 'bullish' as const,
    marketRegimeAlignment: 0.8,
    tfConfluenceScore: 72,
    staleSeconds: 30,
    freshness: 'REALTIME' as const,
    macroRisk: 0.85,
    optionsRows: [],
    timePermission: 'ALLOW' as const,
    timeQuality: 85,
    marketSession: 'regular' as const,
    ...overrides,
  };
}

describe('options assumptions and data gates', () => {
  it('treats IV rank as context, not a standalone trade permission', () => {
    const lowIv = computeDirectionalPressure({
      price: { closes: [99, 100, 101], currentPrice: 101, changePct: 1 },
      indicators: { stochK: 50, stochD: 50, stochMomentum: 0, sma20: 101, sma50: 101 },
      options: { ivRank: 10 },
    });
    const highIv = computeDirectionalPressure({
      price: { closes: [99, 100, 101], currentPrice: 101, changePct: 1 },
      indicators: { stochK: 50, stochD: 50, stochMomentum: 0, sma20: 101, sma50: 101 },
      options: { ivRank: 90 },
    });

    expect(lowIv.components.optionsFlow).toBe(5);
    expect(highIv.components.optionsFlow).toBe(-5);
    expect(Math.abs(lowIv.score)).toBeLessThan(20);
    expect(Math.abs(highIv.score)).toBeLessThanOrEqual(20);
    expect(lowIv.bias).toBe('neutral');
    expect(highIv.confidence).toBeLessThanOrEqual(20);
  });

  it('marks max pain/gamma coverage as unknown when chain evidence is absent', () => {
    const snapshot = calculateDealerGammaSnapshot(null, 100);
    const intelligence = buildDealerIntelligence({
      snapshot,
      currentPrice: 100,
      baseScore: 75,
      setupDescriptor: 'breakout continuation',
      direction: 'bullish',
    });

    expect(snapshot.regime).toBe('NEUTRAL');
    expect(snapshot.pinZone).toBe('UNKNOWN');
    expect(snapshot.coverage).toBe('none');
    expect(snapshot.gammaFlipPrice).toBeNull();
    expect(intelligence.volatilityState).toBe('mixed');
    expect(intelligence.attention.triggered).toBe(false);
  });

  it('classifies dealer gamma as partial evidence and never a full positioning claim', () => {
    const snapshot = calculateDealerGammaSnapshot({
      expirationDate: expiryIn(28),
      maxPain: 100,
      highOIStrikes: [
        { strike: 98, type: 'call', openInterest: 6000, gamma: 0.08, delta: 0.58 },
        { strike: 100, type: 'call', openInterest: 7000, gamma: 0.08, delta: 0.52 },
        { strike: 102, type: 'put', openInterest: 6500, gamma: 0.08, delta: -0.48 },
        { strike: 104, type: 'put', openInterest: 7000, gamma: 0.08, delta: -0.42 },
      ],
    } as any, 100);

    expect(snapshot.coverage).toBe('partial');
    expect(['LONG_GAMMA', 'SHORT_GAMMA', 'NEUTRAL']).toContain(snapshot.regime);
    expect(snapshot.topPositiveStrikes.length + snapshot.topNegativeStrikes.length).toBeGreaterThan(0);
  });

  it('blocks stale option candidates and reports stale-data blockers', () => {
    const result = scoreOptionCandidatesV21WithDiagnostics(baseScoreInput({
      staleSeconds: 7200,
      freshness: 'STALE',
      optionsRows: [
        { expiration: expiryIn(21), strike: 100, type: 'call', bid: 2.4, ask: 2.5, mark: 2.45, volume: 100, open_interest: 1000, delta: 0.5 },
        { expiration: expiryIn(21), strike: 101, type: 'call', bid: 1.9, ask: 2.0, mark: 1.95, volume: 80, open_interest: 900, delta: 0.45 },
        { expiration: expiryIn(21), strike: 100, type: 'put', bid: 2.3, ask: 2.4, mark: 2.35, volume: 100, open_interest: 1000, delta: -0.5 },
        { expiration: expiryIn(21), strike: 99, type: 'put', bid: 1.8, ask: 1.9, mark: 1.85, volume: 80, open_interest: 900, delta: -0.45 },
      ],
    }));

    expect(result.diagnostics.totalCandidates).toBeGreaterThan(0);
    expect(result.diagnostics.allowCandidates).toBe(0);
    expect(result.diagnostics.blockerCounts.data_stale_or_missing).toBeGreaterThan(0);
    expect(result.diagnostics.warnings).toContain('no_allow_candidates_after_spread_liquidity_data_gates');
  });

  it('rejects chains with impossible quotes before spread averages can look clean', () => {
    const quality = assessOptionsChainQuality([
      { expiration: expiryIn(14), strike: 100, type: 'call', bid: 2.5, ask: 2.0, volume: 200, open_interest: 1000 },
      { expiration: expiryIn(14), strike: 101, type: 'call', bid: 0, ask: 0, volume: 200, open_interest: 1000 },
      { expiration: expiryIn(14), strike: 99, type: 'put', bid: 0.1, ask: 0.8, volume: 0, open_interest: 0 },
    ]);

    expect(quality.status).toBe('thin');
    expect(quality.quotedContracts).toBe(1);
    expect(quality.warnings).toEqual(expect.arrayContaining(['low_quoted_contract_coverage', 'wide_average_spread', 'thin_options_liquidity']));
  });
});
