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
      if (String(sql).includes('labeled_since_fix')) {
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
    const overallCall = m.q.mock.calls.find(([sql]) => String(sql).includes('labeled_since_fix'));
    expect(overallCall?.[1]).toEqual(['operator-terminal', '2026-09-26T13:52:24Z']);
  });
});
