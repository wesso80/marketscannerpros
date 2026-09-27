import { beforeEach, describe, expect, it, vi } from 'vitest';
import { q } from '@/lib/db';
import { listBenchmarkSnapshots } from '@/lib/admin/portfolio-lab/benchmarkEngine';
import { findAnalogues } from '@/lib/analogues/search';
import { loadAdminRiskSnapshot } from '@/lib/admin/scan-context';
vi.mock('@/lib/db', () => ({ q: vi.fn() }));
vi.mock('@/lib/marketData/index', () => ({ getQuote: vi.fn() }));
const db = vi.mocked(q);
beforeEach(() => vi.resetAllMocks());
describe('live database shapes', () => {
  it.each([new Date('2026-09-25T20:00:00Z'), '2026-09-25T20:00:00.000Z'])('normalizes benchmark timestamps for analytics (%s)', async timestamp => {
    db.mockResolvedValue([{ snapshot_at: timestamp, benchmark_symbol: 'SPY', benchmark_value: '650', benchmark_return_pct: '1', arca_return_pct: '2', relative_performance_pct: '1' }]);
    const rows = await listBenchmarkSnapshots('workspace-a', 'portfolio-a', {});
    expect(rows[0].snapshotAt).toBe('2026-09-25T20:00:00.000Z');
    expect(rows[0].snapshotAt.slice(0, 10)).toBe('2026-09-25');
  });
  it('queries existing 5-day outcome fields and scopes the outcome join', async () => {
    db.mockResolvedValueOnce([{ exists: true }]).mockResolvedValueOnce([{ id: 1, symbol: 'SPY', surfaced_at: new Date('2026-09-01'), playbook: null, setup_type: 'breakout', direction: 'bullish', regime: null, opportunity_score: '70', evidence_quality: '80', distance: '0.1', classification: 'complete', r_multiple: '1.5', resolved_at: new Date('2026-09-08') }]);
    const out = await findAnalogues({ workspaceId: 'workspace-a', features: { symbol: 'SPY' } as never });
    const sql = db.mock.calls[1][0];
    expect(sql).toContain('o.realised_r_5d::text AS r_multiple');
    expect(sql).toContain('o.outcome_status AS classification');
    expect(sql).toContain('o.workspace_id = s.workspace_id');
    expect(sql).not.toContain('o.classification');
    expect(out.summary).toMatchObject({ avgRMultiple: 1.5, winRate: 1 });
  });
  it('never reads another workspace operator state for an authenticated risk view', async () => {
    db.mockImplementation(async (sql) => {
      if (sql.includes('FROM operator_state')) return [{ context_state: { equity: 100000, permission: 'BLOCK', maxPositions: 10 }, updated_at: '2026-09-27' }];
      return [];
    });
    const out = await loadAdminRiskSnapshot('workspace-a');
    const call = db.mock.calls.find(([sql]) => sql.includes('FROM operator_state'))!;
    expect(call[0]).toContain('WHERE workspace_id = $1');
    expect(call[1]).toEqual(['workspace-a']);
    expect(out.permission).toBe('BLOCK');
    expect(out.workspaceId).toBe('workspace-a');
  });
  it('withholds clearance when portfolio reads fail after an operator GO', async () => {
    db.mockImplementation(async (sql) => {
      if (sql.includes('FROM operator_state')) return [{ context_state: { equity: 100000, permission: 'GO', maxPositions: 10 }, updated_at: '2026-09-27' }];
      throw new Error('ledger offline');
    });
    const out = await loadAdminRiskSnapshot('workspace-a');
    expect(out.permission).toBe('WAIT');
    expect(out.sizeMultiplier).toBe(0);
    expect(out.operatorGuardActive).toBe(true);
  });
});
