import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ q: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: m.q }));
import { readDecisions, reviewCheckpoints, saveDecision } from '@/lib/admin/decisionRecords';
import type { DecisionAssessment } from '@/lib/admin/decisionDesk';
beforeEach(() => { vi.clearAllMocks(); });
describe('immutable research decisions', () => {
  it('reads only the authenticated workspace without creating tables', async () => {
    m.q.mockResolvedValue([]); await readDecisions('workspace-a');
    expect(m.q).toHaveBeenCalledTimes(1);
    expect(m.q.mock.calls[0][0]).toMatch(/^SELECT.*workspace_id = \$1/);
    expect(m.q.mock.calls[0][1]).toEqual(['workspace-a']);
  });
  it('distinguishes an uninitialized history from a broken database', async () => {
    m.q.mockRejectedValue({code:'42P01'}); expect((await readDecisions('a')).available).toBe(false);
    m.q.mockRejectedValue(new Error('offline')); await expect(readDecisions('a')).rejects.toThrow('offline');
  });
  it('inserts immutable evidence without overwriting an earlier request', async () => {
    m.q.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id:'record' }]);
    await saveDecision('workspace-a',{ requestId:'uuid', action:'WATCH',note:'Watch for confirmation',
      assessment:{symbol:'TEST',market:'EQUITIES',strategyId:'POSITION_6W',evidenceId:'abc'} as DecisionAssessment,
      account:{status:'WAIT'},macro:{verdict:null},referencePrice:100,referenceAt:'2026-09-27T12:00:00Z' });
    const [sql,params] = m.q.mock.calls[1];
    expect(sql).toContain('ON CONFLICT (workspace_id, request_id) DO NOTHING');
    expect(params[1]).toBe('workspace-a');
    expect(JSON.parse(params[8]).account.status).toBe('WAIT');
  });
  it('sets exact calendar checkpoints without fabricating a return', () => {
    const checkpoints = reviewCheckpoints('2026-09-27T12:00:00Z',Date.parse('2026-11-08T12:00:00Z'));
    expect(checkpoints[0]).toMatchObject({horizonDays:42,dueAt:'2026-11-08T12:00:00.000Z',status:'DUE',observation:null});
    expect(checkpoints[1]).toMatchObject({horizonDays:84,dueAt:'2026-12-20T12:00:00.000Z',status:'PENDING',observation:null});
  });
});
