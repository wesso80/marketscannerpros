/**
 * Fix 8: Golden Egg's expected move averaged the IV of every strike (the smile's far wings overstate it) — now ATM IV.
 *        options-scan replaced a 0-DTE (zero) expected move with a silent 3% — now passes null.
 * Fix 9: the strike picker applied ONE expected move (the selected, often weekly, expiry's) to every expiry 0-90 DTE —
 *        now each expiry gets its own move: its ATM IV × √(DTE/365).
 * Plus fix 5 in the picker: unknown IV rank is left out of the score (was a fake 50), long and short treated alike.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { atmImpliedVol, summarizeChain } from '../lib/goldenEgg/optionsChain';
import { atmIvForExpiry, expectedMoveForExpiry, scoreOptionCandidatesV21WithDiagnostics, type AVOptionRow } from '../lib/scoring/options-v21';

afterEach(() => { vi.useRealTimers(); });

const smileIv = (k: number) => 0.2 + Math.abs(k - 100) * 0.02; // ATM 20%, wings up to 60%

describe('8. Golden Egg expected move uses ATM IV', () => {
  const nowMs = Date.parse('2026-09-26T14:00:00Z');
  const exp = '2026-10-26'; // 30 DTE
  const chain = [80, 90, 98, 100, 102, 110, 120].flatMap((k) => (['call', 'put'] as const).map((type) => ({
    contractID: `XYZ${type}${k}`, symbol: 'XYZ', expiration: exp, strike: String(k), type, open_interest: '1000', volume: '50',
    implied_volatility: String(smileIv(k)), date: '2026-09-25',
  })));

  it('ATM IV ignores the wings', () => {
    expect(atmImpliedVol(chain as any, 100)).toBeCloseTo((0.24 + 0.2 + 0.24) / 3, 6); // strikes 98/100/102
    expect(atmImpliedVol(chain as any, 0)).toBeNull();
  });

  it('expected move = spot × ATM IV × √(DTE/365), smaller than the all-strike average would give', () => {
    const snap = summarizeChain(chain as any, 100, { nowMs })!;
    const atm = (0.24 + 0.2 + 0.24) / 3;
    expect(snap.daysToExpiry).toBe(30);
    expect(snap.ivBasis).toBe('atm');
    expect(snap.expectedMovePct).toBeCloseTo(Math.round(atm * Math.sqrt(30 / 365) * 1000) / 10, 5);
    expect(snap.expectedMovePct!).toBeLessThan(snap.avgIv! * Math.sqrt(30 / 365) * 100);
  });
});

describe('9. strike picker: expected move per expiry (√DTE)', () => {
  const rowsFor = (expiration: string, iv: number | null): AVOptionRow[] => [96, 98, 100, 102, 104].flatMap((k) => (['call', 'put'] as const).map((type) => ({
    contractID: `XYZ${expiration}${type}${k}`, expiration, strike: k, type,
    bid: 2.0, ask: 2.1, mark: 2.05, volume: 500, open_interest: 2000,
    implied_volatility: iv ?? undefined, delta: type === 'call' ? 0.5 : -0.5,
  })));

  it('ATM IV × √(DTE/365); a 63-DTE move is 3× a 7-DTE move at the same IV', () => {
    const r = rowsFor('2030-01-18', 0.25);
    expect(atmIvForExpiry(r, 100)).toBeCloseTo(0.25);
    const m7 = expectedMoveForExpiry(r, 100, 7, { expectedMovePct: null })!;
    const m63 = expectedMoveForExpiry(r, 100, 63, { expectedMovePct: null })!;
    expect(m7).toBeCloseTo(25 * Math.sqrt(7 / 365), 6);
    expect(m63 / m7).toBeCloseTo(3, 6);
  });

  it('without chain IV, rescales the analysed expiry\'s move by √time; with nothing known → null (no silent 3%)', () => {
    const noIv = rowsFor('2030-01-18', null);
    expect(expectedMoveForExpiry(noIv, 100, 63, { expectedMovePct: 2, expectedMoveDte: 7 })).toBeCloseTo(6, 6);
    expect(expectedMoveForExpiry(noIv, 100, 63, { expectedMovePct: null })).toBeNull();
    expect(expectedMoveForExpiry(noIv, 100, 0, { expectedMovePct: 0 })).toBeNull();
  });

  const base = {
    symbol: 'XYZ', timeframe: 'swing_1d', spot: 100, marketDirection: 'neutral' as const, marketRegimeAlignment: 0.7,
    tfConfluenceScore: 70, staleSeconds: 30, freshness: 'REALTIME' as const, macroRisk: 0.8, timePermission: 'ALLOW' as const,
    timeQuality: 90, marketSession: 'regular' as const,
  };

  it('each expiry\'s candidates carry their own move', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-26T14:00:00Z'));
    const res = scoreOptionCandidatesV21WithDiagnostics({
      ...base, expectedMovePct: 1.5, expectedMoveDte: 7, ivRank: null,
      optionsRows: [...rowsFor('2026-10-03', 0.25), ...rowsFor('2026-11-28', 0.25)],
    });
    const moves = res.candidates.map((c: any) => ({ dte: c.evidence.optionsCandidate.dte, em: c.evidence.optionsCandidate.expectedMovePct }));
    expect(new Set(moves.map((x) => x.dte))).toEqual(new Set([7, 63]));
    const em7 = moves.find((x) => x.dte === 7)?.em;
    const em63 = moves.find((x) => x.dte === 63)?.em;
    expect(em7).toBeCloseTo(25 * Math.sqrt(7 / 365), 4);
    expect(em63).toBeCloseTo(25 * Math.sqrt(63 / 365), 4);
  });

  it('no expected move and no chain IV → no candidates rather than a made-up 3% band', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-26T14:00:00Z'));
    const res = scoreOptionCandidatesV21WithDiagnostics({ ...base, expectedMovePct: null, ivRank: null, optionsRows: rowsFor('2026-10-03', null) });
    expect(res.diagnostics.totalCandidates).toBe(0);
  });

  it('unknown IV rank: volFit carries no weight and calls/puts are scored alike', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-26T14:00:00Z'));
    const res = scoreOptionCandidatesV21WithDiagnostics({ ...base, expectedMovePct: 2, ivRank: null, optionsRows: rowsFor('2026-10-03', 0.25) });
    const anyCandidate = res.candidates[0] as any;
    const volFit = anyCandidate.contrib.find((c: any) => c.key === 'context_volFit');
    expect(volFit.weight).toBe(0);
    expect(volFit.points).toBe(0);
    const call = res.candidates.find((c: any) => c.evidence.optionsCandidate.strategyType === 'CALL') as any;
    const put = res.candidates.find((c: any) => c.evidence.optionsCandidate.strategyType === 'PUT') as any;
    expect(call.scores.context).toBe(put.scores.context);
  });
});
