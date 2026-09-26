import { beforeEach, describe, expect, it, vi } from 'vitest';

// M5: only gradeable signals are logged (no BLOCK, no score 0, no US-equity rows while the market is shut),
// deduped per symbol + playbook + direction + NY day; stats separate old-labeller labels.

const m = vi.hoisted(() => ({ q: vi.fn(async (_s: string, _p?: unknown[]) => [] as unknown[]), elite: 60 }));
vi.mock('@/lib/db', () => ({ q: m.q }));
vi.mock('@/lib/operator/elite-score', () => ({
  computeEliteSignalScore: () => ({ score: m.elite, grade: 'B', setupState: 'WATCHING', triggerDistancePct: 1 }),
}));
vi.mock('@/lib/adminAuth', () => ({ requireAdmin: vi.fn(async () => ({ ok: true })) }));

import { recordSignals, signalSkipReason } from '@/lib/admin/signal-recorder';
import { GET as statsGET, LABELLER_FIX_AT } from '@/app/api/admin/signals/stats/route';

const OPEN = Date.parse('2026-09-25T17:00:00Z'); // Fri 13:00 ET
const SAT = Date.parse('2026-09-26T14:10:00Z'); // Sat
const pipe = (over: { perm?: string; final?: string; dir?: string; conf?: number; symbol?: string } = {}) => ({
  verdict: {
    symbol: over.symbol ?? 'MA', permission: over.perm ?? 'ALLOW', direction: over.dir ?? 'LONG', confidenceScore: over.conf ?? 0.72,
    regime: 'TREND_UP', playbook: 'BREAKOUT', qualityScore: 0.6, sizeMultiplier: 1, evidence: {}, verdictId: 'v', penalties: [], reasonCodes: [],
  },
  governance: { finalPermission: over.final ?? 'ALLOW', blockReasons: [] },
  candidate: { entryZone: { min: 100 }, invalidationPrice: 95, targets: [110, 120] },
  lastPrice: 101,
}) as never;

beforeEach(() => {
  m.q.mockReset();
  m.q.mockImplementation(async (sql: string) => (String(sql).includes('INSERT INTO ai_signal_log') ? [{ id: 1 }] : []));
  m.elite = 60;
});

describe('signalSkipReason', () => {
  it('logs a directional, scored, allowed equity signal during the session', () => {
    expect(signalSkipReason(pipe(), 'EQUITIES', OPEN)).toBeNull();
  });
  it('skips BLOCK (market or governance), score 0, and closed-market equities', () => {
    expect(signalSkipReason(pipe({ perm: 'BLOCK' }), 'EQUITIES', OPEN)).toBe('blocked');
    expect(signalSkipReason(pipe({ final: 'BLOCK' }), 'EQUITIES', OPEN)).toBe('blocked');
    expect(signalSkipReason(pipe({ conf: 0.001 }), 'EQUITIES', OPEN)).toBe('score_zero');
    m.elite = 0;
    expect(signalSkipReason(pipe(), 'EQUITIES', OPEN)).toBe('score_zero');
    m.elite = 60;
    expect(signalSkipReason(pipe(), 'EQUITIES', SAT)).toBe('market_closed');
  });
  it('crypto trades 24/7: not skipped on a Saturday', () => {
    expect(signalSkipReason(pipe(), 'CRYPTO', SAT)).toBeNull();
  });
});

describe('recordSignals', () => {
  it('inserts only the gradeable rows; dedupe is symbol + direction + playbook + NY day', async () => {
    const n = await recordSignals([pipe(), pipe({ symbol: 'V', perm: 'BLOCK' }), pipe({ symbol: 'HD', conf: 0 })], 'EQUITIES', '15m', OPEN);
    expect(n).toBe(1);
    const inserts = m.q.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO ai_signal_log'));
    expect(inserts).toHaveLength(1);
    expect(inserts[0][1]?.[1]).toBe('MA');
    const dedupe = m.q.mock.calls.find(([sql]) => String(sql).includes('SELECT id FROM ai_signal_log'));
    expect(String(dedupe?.[0])).toContain("decision_trace->>'playbook'");
    expect(String(dedupe?.[0])).toContain("AT TIME ZONE 'America/New_York'");
    expect(dedupe?.[1]).toEqual(['operator-terminal', 'MA', 'LONG', 'BREAKOUT', '2026-09-25']);
  });

  it('a weekend equity rescan logs nothing', async () => {
    expect(await recordSignals([pipe(), pipe({ symbol: 'V' })], 'EQUITIES', '15m', SAT)).toBe(0);
    expect(m.q).not.toHaveBeenCalled();
  });

  it('an already-logged setup today is not logged again', async () => {
    m.q.mockImplementation(async (sql: string) => (String(sql).includes('SELECT id FROM ai_signal_log') ? [{ id: 9 }] : [{ id: 1 }]));
    expect(await recordSignals([pipe()], 'EQUITIES', '15m', OPEN)).toBe(0);
  });
});

describe('signal stats labelling', () => {
  it('reports since-fix figures, old-method count, directional hit rate and a clear metric label', async () => {
    m.q.mockImplementation(async (sql: string) => {
      if (String(sql).includes('labeled_old_method')) {
        return [{ total_signals: 300, labeled: 200, pending: 100, correct: 100, wrong: 30, neutral: 50, expired: 20,
          labeled_old_method: 180, labeled_since_fix: 20, correct_since_fix: 8, wrong_since_fix: 4 }];
      }
      return [];
    });
    const res = await statsGET(new Request('http://x/api/admin/signals/stats') as never);
    const body = await res.json();
    expect(body.overall.accuracyRate).toBe(50);
    expect(body.overall.accuracyLabel).toContain('incl. neutral/expired');
    expect(body.overall.directionalHitRate).toBe(76.9);
    expect(body.overall.labeledOldMethod).toBe(180);
    expect(body.sinceFix.labeled).toBe(20);
    expect(body.sinceFix.accuracyRate).toBe(40);
    expect(body.sinceFix.directionalHitRate).toBe(66.7);
    expect(body.sinceFix.since).toBe(LABELLER_FIX_AT);
    const overallCall = m.q.mock.calls.find(([sql]) => String(sql).includes('labeled_old_method'));
    expect(overallCall?.[1]).toEqual(['operator-terminal', '2026-09-26T13:52:24Z']);
  });

  it('averages moves signed to the call direction and breaks since-fix results down by direction, asset, 4h and source', async () => {
    m.q.mockImplementation(async (sql: string) => {
      const s = String(sql);
      if (s.includes('labeled_old_method')) return [{ total_signals: 10, labeled: 6, correct: 3, wrong: 2, avg_move_correct: 1.8, avg_move_wrong: 1.1, avg_signed_move_since_fix: '0.42', neutral_since_fix: 1, labeled_since_fix: 6, correct_since_fix: 3, wrong_since_fix: 2 }];
      if (s.includes('GROUP BY regime')) return [{ regime: 'TREND_UP', total: 8, correct: 5, wrong: 1, labeled: 7, correct_since_fix: 2, wrong_since_fix: 2, labeled_since_fix: 4 }];
      if (s.includes('GROUPING SETS ((UPPER')) return [
        { dir: 'LONG', asset: null, labeled: 4, correct: 3, wrong: 1, neutral: 0, avg_signed_move: '0.9' },
        { dir: 'SHORT', asset: null, labeled: 2, correct: 0, wrong: 1, neutral: 1, avg_signed_move: '-0.5' },
        { dir: null, asset: 'equity', labeled: 6, correct: 3, wrong: 2, neutral: 1, avg_signed_move: '0.42' },
      ];
      if (s.includes('outcome_4h IN')) return [{ dir: null, labeled: 5, correct: 2, wrong: 2, neutral: 1, avg_signed_move: '0.1' }];
      if (s.includes("LIKE 'admin-call:%'")) return [{ source: 'admin-call:priority-desk', total: 12, pending: 9, labeled: 3, correct: 2, wrong: 1, neutral: 0, avg_signed_move: '0.7', first_at: null }];
      return [];
    });
    const body = await (await statsGET(new Request('http://x/api/admin/signals/stats') as never)).json();
    const all = m.q.mock.calls.map(([s]) => String(s)).join('\n');
    // SHORT moves are flipped before averaging (a correct short counts positive)
    expect(all).toContain("CASE WHEN UPPER(trade_bias) = 'SHORT' THEN -pct_move_24h ELSE pct_move_24h END");
    expect(all).toContain("CASE WHEN UPPER(trade_bias) = 'SHORT' THEN -pct_move_4h ELSE pct_move_4h END");
    expect(body.sinceFix.avgSignedMovePct).toBe(0.42);
    expect(body.sinceFix.neutral).toBe(1);
    expect(body.sinceFix.byDirection).toEqual([
      expect.objectContaining({ direction: 'LONG', directionalHitRate: 75, avgSignedMovePct: 0.9 }),
      expect.objectContaining({ direction: 'SHORT', directionalHitRate: 0, avgSignedMovePct: -0.5 }),
    ]);
    expect(body.sinceFix.byAsset).toEqual([expect.objectContaining({ asset: 'equity', labeled: 6 })]);
    expect(body.sinceFix.horizon4h.overall).toMatchObject({ labeled: 5, directionalHitRate: 50 });
    expect(body.bySource).toEqual([expect.objectContaining({ source: 'admin-call:priority-desk', total: 12, pending: 9, directionalHitRate: 66.7 })]);
    // regime bars use since-fix counts
    expect(body.byRegime[0]).toMatchObject({ correctSinceFix: 2, wrongSinceFix: 2, labeledSinceFix: 4, directionalHitRateSinceFix: 50 });
  });

  it('4h block is null when the 4h columns are missing', async () => {
    m.q.mockImplementation(async (sql: string) => {
      if (String(sql).includes('outcome_4h IN')) throw new Error('column "outcome_4h" does not exist');
      return [];
    });
    const body = await (await statsGET(new Request('http://x/api/admin/signals/stats') as never)).json();
    expect(body.sinceFix.horizon4h).toBeNull();
  });
});
