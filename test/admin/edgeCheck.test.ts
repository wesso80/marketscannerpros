/**
 * Edge Check: intervals, after-cost averages, earlier/later halves and evidence verdicts. Read-only route over
 * fixed-labeller verdicts; whitelisted grouping only.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { ASSUMED_COST_PCT, MIN_SAMPLE, edgeCheck, meanInterval, summariseGroup, wilson, type EdgeRow } from '@/lib/admin/edgeCheck';
import { RESEARCH_READ_PATHS } from '@/lib/admin/researchReadKey';
import { LABELLER_FIX_AT } from '@/lib/admin/signalStats';

const m = vi.hoisted(() => ({ sql: [] as string[], params: [] as unknown[][], rows: [] as unknown[] }));
vi.mock('@/lib/adminAuth', () => ({ requireAdmin: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/db', () => ({ q: vi.fn(async (sql: string, params: unknown[]) => { m.sql.push(sql); m.params.push(params); return m.rows; }) }));
import { GET } from '@/app/api/admin/edge-check/route';

const day0 = Date.parse('2026-09-27T00:00:00Z');
const series = (group: string, moves: number[]): EdgeRow[] => moves.map((mv, i) => ({
  group, signalAt: new Date(day0 + i * 3600_000).toISOString(), outcome: mv >= 1 ? 'correct' : mv <= -1 ? 'wrong' : 'neutral', signedMove: mv,
}));
const repeat = (pattern: number[], n: number) => Array.from({ length: n }, (_, i) => pattern[i % pattern.length]);

beforeEach(() => { m.sql = []; m.params = []; m.rows = []; });

describe('statistics', () => {
  it('wilson interval brackets the observed rate', () => {
    const w = wilson(30, 60)!;
    expect(w.low).toBeLessThan(50); expect(w.high).toBeGreaterThan(50);
    expect(wilson(0, 0)).toBeNull();
  });
  it('mean interval narrows with more samples', () => {
    const a = meanInterval([1, -1, 2, -2])!, b = meanInterval(repeat([1, -1, 2, -2], 400))!;
    expect(b.high - b.low).toBeLessThan(a.high - a.low);
  });
});

describe('verdicts', () => {
  it('too few signals → insufficient_sample', () => {
    expect(summariseGroup('A', series('A', repeat([2, 1.5], MIN_SAMPLE - 1))).verdict).toBe('insufficient_sample');
  });
  it('coin-flip moves → no edge after costs', () => {
    expect(summariseGroup('A', series('A', repeat([1.5, -1.5], 80))).verdict).toBe('no_edge_after_costs');
  });
  it('steady positive moves in both halves → positive after costs, with cost deducted', () => {
    const g = summariseGroup('A', series('A', repeat([2, 1.2, 0.8, 1.6], 80)));
    expect(g.verdict).toBe('positive_after_costs');
    expect(g.avgMove).toBe(1.4);
    expect(g.avgMoveAfterCost).toBe(Math.round((1.4 - ASSUMED_COST_PCT) * 100) / 100);
    expect(g.earlier.n + g.later.n).toBe(80);
  });
  it('strong early, negative later → inconsistent', () => {
    const g = summariseGroup('A', series('A', [...repeat([3, 2.5], 50), ...repeat([-0.5, -0.3], 50)]));
    expect(g.verdict).toBe('inconsistent');
    expect(g.later.avgMoveAfterCost!).toBeLessThanOrEqual(0);
  });
  it('drops bad prints and ranks evidence before sample size', () => {
    const r = edgeCheck([...series('good', repeat([2, 1.2, 0.8, 1.6], 80)), ...series('thin', [5]), { ...series('bad', [500])[0] }]);
    expect(r.groups.map((g) => g.group)).toEqual(['good', 'thin']);
    expect(r.overall.n).toBe(81);
  });
});

describe('GET /api/admin/edge-check', () => {
  it('reads fixed-labeller verdicts only, groups by a whitelisted expression and states its basis', async () => {
    m.rows = series('Breakout · LONG', repeat([2, -1.2], 40)).map((r) => ({ grp: r.group, signal_at: r.signalAt, outcome: r.outcome, signed_move: r.signedMove }));
    const body = await (await GET(new NextRequest('http://localhost/api/admin/edge-check?by=regime&days=30'))).json();
    expect(m.sql[0]).toMatch(/outcome_measured_at >= \$1::timestamptz/);
    expect(m.sql[0]).toMatch(/workspace_id = 'operator-terminal'/);
    expect(m.sql[0]).toMatch(/COALESCE\(regime, 'unknown'\) AS grp/);
    expect(m.params[0]).toEqual([LABELLER_FIX_AT, 30]);
    expect(body).toMatchObject({ ok: true, by: 'regime', days: 30 });
    expect(body.definition.costs).toMatch(/Assumed 0.2% round trip/);
    expect(body.definition.split).toMatch(/equal timestamps stay together/);
    expect(body.definition.split).toMatch(/not a held-out test/);
    expect(body.definition.intervals).toMatch(/assume independent observations/);
    expect(body.definition.caveats.join(' ')).toMatch(/no embargo/);
    expect(body.definition.caveats.join(' ')).toMatch(/Not a recommendation/);
    expect(body.truth.source).toMatch(/ai_signal_log/);
  });
  it('ignores unknown grouping and clamps the window', async () => {
    await GET(new NextRequest('http://localhost/api/admin/edge-check?by=1;DROP&days=9999'));
    expect(m.sql[0]).not.toMatch(/DROP/);
    expect(m.params[0]).toEqual([LABELLER_FIX_AT, 365]);
  });
  it('is on the research-key read allowlist and linked in admin navigation', () => {
    expect(RESEARCH_READ_PATHS.has('/api/admin/edge-check')).toBe(true);
    expect(readFileSync('app/admin/admin-client-layout.tsx', 'utf8')).toContain('{ href: "/admin/edge-check", label: "Edge Check"');
  });
});
