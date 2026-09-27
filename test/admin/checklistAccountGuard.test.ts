import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runChecklist, type ChecklistInput } from '@/lib/preTrade/checklist';
import { loadAdminRiskSnapshot, type AdminRiskSnapshot } from '@/lib/admin/scan-context';
import { q } from '@/lib/db';
vi.mock('@/lib/db', () => ({ q: vi.fn() }));
vi.mock('@/lib/admin/scan-context', () => ({ loadAdminRiskSnapshot: vi.fn() }));
vi.mock('@/lib/playbooks', () => ({ getPlaybook: () => ({ preferredRegime: 'any', ivBias: 'iv-any' }) }));
const risk = vi.mocked(loadAdminRiskSnapshot);
const valid: ChecklistInput = { workspaceId: 'workspace-a', symbol: 'SPY', playbookId: 'test', observedRegime: 'any', evidenceQuality: 70, freshness: 'real-time', proposedSizePct: 1, currentExposure: { sameSymbolPct: 0, sameSectorPct: 0 } };
const snapshot = (permission: 'GO' | 'WAIT' | 'BLOCK') => ({ workspaceId: 'workspace-a', equity: 100000, permission, source: 'portfolio_journal', killSwitchActive: permission === 'BLOCK', operatorGuardReasons: [] }) as unknown as AdminRiskSnapshot;
beforeEach(() => { vi.resetAllMocks(); risk.mockResolvedValue(snapshot('GO')); vi.mocked(q).mockResolvedValue([{ n: '0', count: '0' }]); });
describe('checklist clearance', () => {
  it('uses the same workspace risk state even with optimistic manual inputs', async () => {
    risk.mockResolvedValue(snapshot('BLOCK'));
    const out = await runChecklist(valid);
    expect(risk).toHaveBeenCalledWith('workspace-a');
    expect(out.recommendation).toBe('no-go');
    expect(out.blockingGates).toContain('account_risk');
  });
  it.each(['WAIT', 'BLOCK'] as const)('never clears a %s account', async permission => {
    risk.mockResolvedValue(snapshot(permission));
    expect((await runChecklist(valid)).recommendation).toBe('no-go');
  });
  it('withholds clearance for unknown or other-workspace account state', async () => {
    risk.mockResolvedValue({ ...snapshot('GO'), workspaceId: 'workspace-b' });
    expect((await runChecklist(valid)).recommendation).toBe('no-go');
    risk.mockResolvedValue({ ...snapshot('GO'), source: 'fallback' });
    expect((await runChecklist(valid)).recommendation).toBe('no-go');
  });
  it('does not count missing evidence, size, or partial exposure as zero', async () => {
    for (const patch of [{ evidenceQuality: undefined }, { evidenceQuality: NaN }, { proposedSizePct: undefined }, { currentExposure: {} }]) {
      expect((await runChecklist({ ...valid, ...patch })).recommendation).toBe('no-go');
    }
  });
  it('treats unknown advisory gates as caution and database failures as no-go', async () => {
    expect((await runChecklist({ ...valid, playbookId: null })).recommendation).toBe('caution');
    vi.mocked(q).mockRejectedValue(new Error('offline'));
    expect((await runChecklist(valid)).recommendation).toBe('no-go');
  });
  it('permits research clearance only when required gates are known and passed', async () => {
    expect((await runChecklist(valid)).recommendation).toBe('go');
  });
});
