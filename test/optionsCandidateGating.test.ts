import { describe, expect, it } from 'vitest';
import { scoreOptionCandidatesV21WithDiagnostics } from '../lib/scoring/options-v21';

function baseInput(optionsRows: Parameters<typeof scoreOptionCandidatesV21WithDiagnostics>[0]['optionsRows']) {
  return {
    symbol: 'SPY',
    timeframe: 'intraday_1h',
    spot: 100,
    expectedMovePct: 5,
    ivRank: 45,
    marketDirection: 'bullish' as const,
    marketRegimeAlignment: 0.8,
    tfConfluenceScore: 75,
    staleSeconds: 30,
    freshness: 'REALTIME' as const,
    macroRisk: 0.8,
    optionsRows,
    timePermission: 'ALLOW' as const,
    timeQuality: 90,
    marketSession: 'regular' as const,
  };
}

describe('options candidate gating diagnostics', () => {
  it('blocks wide-spread and thin-liquidity contracts before they can look clean', () => {
    const result = scoreOptionCandidatesV21WithDiagnostics(baseInput([
      { expiration: '2026-05-15', strike: 100, type: 'call', bid: 0.1, ask: 0.8, mark: 0.45, volume: 0, open_interest: 0, delta: 0.5 },
      { expiration: '2026-05-15', strike: 101, type: 'call', bid: 0.1, ask: 0.9, mark: 0.5, volume: 0, open_interest: 0, delta: 0.45 },
      { expiration: '2026-05-15', strike: 100, type: 'put', bid: 0.1, ask: 0.8, mark: 0.45, volume: 0, open_interest: 0, delta: -0.5 },
      { expiration: '2026-05-15', strike: 99, type: 'put', bid: 0.1, ask: 0.9, mark: 0.5, volume: 0, open_interest: 0, delta: -0.45 },
    ]));

    expect(result.diagnostics.totalCandidates).toBeGreaterThan(0);
    expect(result.diagnostics.allowCandidates).toBe(0);
    expect(result.diagnostics.blockedCandidates).toBe(result.diagnostics.totalCandidates);
    expect(result.diagnostics.topCandidateBlocked).toBe(true);
    expect(result.diagnostics.blockerCounts.leg_spread_too_wide).toBeGreaterThan(0);
    expect(result.diagnostics.blockerCounts.oi_below_minimum).toBeGreaterThan(0);
    expect(result.diagnostics.blockerCounts.volume_below_minimum).toBeGreaterThan(0);
    expect(result.diagnostics.warnings).toContain('no_allow_candidates_after_spread_liquidity_data_gates');
    expect(result.candidates[0].permission.state).toBe('BLOCK');
  });

  it('reports allow candidates for clean, liquid contracts', () => {
    const result = scoreOptionCandidatesV21WithDiagnostics(baseInput([
      { expiration: '2026-05-01', strike: 100, type: 'call', bid: 2.4, ask: 2.5, mark: 2.45, volume: 100, open_interest: 1000, delta: 0.5 },
      { expiration: '2026-05-01', strike: 101, type: 'call', bid: 1.9, ask: 2.0, mark: 1.95, volume: 80, open_interest: 900, delta: 0.45 },
      { expiration: '2026-05-01', strike: 100, type: 'put', bid: 2.3, ask: 2.4, mark: 2.35, volume: 100, open_interest: 1000, delta: -0.5 },
      { expiration: '2026-05-01', strike: 99, type: 'put', bid: 1.8, ask: 1.9, mark: 1.85, volume: 80, open_interest: 900, delta: -0.45 },
    ]));

    expect(result.diagnostics.totalCandidates).toBeGreaterThan(0);
    expect(result.diagnostics.allowCandidates).toBeGreaterThan(0);
    expect(result.diagnostics.topCandidateBlocked).toBe(false);
    expect(result.diagnostics.warnings).toEqual([]);
    expect(result.candidates[0].permission.state).toBe('ALLOW');
  });
});
