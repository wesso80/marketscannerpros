import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/db', () => ({ q: vi.fn() }));
vi.mock('@/lib/admin/arca-brain/regimePlaybookMatrix', () => ({ listRegimeMatrix: vi.fn() }));
import { q } from '@/lib/db';
import { listRegimeMatrix } from '@/lib/admin/arca-brain/regimePlaybookMatrix';
import { buildMicroEvidence, type MicroInput } from '@/lib/upeMicroEvidence';
import { assessPaperRegime, loadPaperRegimeContext, paperRegimeSummary, type PaperRegimeContext } from '@/lib/admin/portfolio-lab/paperRegime';
import type { RegimePlaybookMatrixRow } from '@/lib/admin/arca-brain/types';
const now = Date.parse('2026-09-28T12:00:00Z');
const at = new Date(now - 60_000).toISOString();
const input = (): MicroInput => ({ assetClass: 'crypto', changePercent: 1, relVol: 1, fetchedAt: at, observedAt: at });
const rows = () => Array.from({ length: 25 }, input);
const policy = (): RegimePlaybookMatrixRow => ({ id: 'policy1', workspaceId: 'w', regime: 'crypto:risk_on', enabledPlaybooks: ['trend'], reducedSizePlaybooks: [], disabledPlaybooks: [], preferredAssetClasses: [], avoidedAssetClasses: [], requiredConfirmations: [], notes: null, updatedBy: 'admin', createdAt: at, updatedAt: at });
function context(): PaperRegimeContext {
  const evidence = buildMicroEvidence(rows(), now);
  return { snapshots: [{ asset_class: 'crypto', micro_state: evidence.microState, computed_at: new Date(now).toISOString(), components_json: evidence.components }], policies: [policy()] };
}
const assess = (c: PaperRegimeContext) => assessPaperRegime(c, 'w', 'crypto', 'trend', now);
describe('regime evidence', () => {
  it('retains the existing breadth-volume formula on valid inputs', () => {
    expect(buildMicroEvidence(rows(), now)).toMatchObject({ microState: 'risk_on', components: { usable: true, symbolCount: 25, coverage: 1 } });
  });
  it('does not turn missing observations into a neutral regime', () => {
    const r = rows().map(r => ({ ...r, observedAt: null }));
    expect(buildMicroEvidence(r, now)).toMatchObject({ microState: 'unknown', components: { usable: false } });
  });
  it('requires both sufficient count and coverage', () => {
    expect(buildMicroEvidence(rows().slice(0, 19), now).components.usable).toBe(false);
    const r = rows(); for (let i = 0; i < 6; i++) r[i].changePercent = null;
    expect(buildMicroEvidence(r, now).components.usable).toBe(false);
    expect(buildMicroEvidence(rows().slice(0, 20), now).components.usable).toBe(true);
  });
  it.each(['fetchedAt', 'observedAt'] as const)('rejects stale %s despite a current other timestamp', field => {
    const r = rows().map(r => ({ ...r, [field]: new Date(now - 3 * 3600_000).toISOString() }));
    expect(buildMicroEvidence(r, now).components.usable).toBe(false);
  });
  it('rejects future timestamps and non-finite input', () => {
    expect(buildMicroEvidence(rows().map(r => ({ ...r, observedAt: new Date(now + 1) })), now).components.usable).toBe(false);
    expect(buildMicroEvidence(rows().map(r => ({ ...r, changePercent: NaN })), now).components.usable).toBe(false);
  });
});
describe('paper regime wiring', () => {
  it('allows only fresh asset-matched evidence plus an explicit workspace policy', () => {
    expect(assess(context())).toMatchObject({ status: 'ENABLED', regime: 'crypto:risk_on', sourceRuleId: 'policy1' });
  });
  it('does not reuse equities as a crypto regime', () => {
    const c = context(); c.snapshots[0].asset_class = 'equity';
    expect(assess(c).reason).toBe('regime_evidence_missing:crypto');
  });
  it('does not alias a trend policy or use a different workspace', () => {
    for (const change of [{ regime: 'RISK_ON_TREND' }, { workspaceId: 'other' }, { regime: 'equity:risk_on' }]) {
      const c = context(); Object.assign(c.policies[0], change);
      expect(assess(c)).toMatchObject({ status: 'UNKNOWN_REGIME', sizeMultiplier: 0, reason: 'regime_policy_missing:crypto:risk_on' });
    }
  });
  it('rejects old snapshots without source provenance', () => {
    const c = context(); delete c.snapshots[0].components_json.evidenceVersion;
    expect(assess(c).sizeMultiplier).toBe(0);
  });
  it('rechecks source age at decision time', () => {
    const c = context(); c.snapshots[0].components_json.sourceOldestAt = new Date(now - 3 * 3600_000).toISOString();
    expect(assess(c).reason).toBe('regime_evidence_stale_or_invalid:crypto');
  });
  it('does not let reduced size bypass confirmations', () => {
    const c = context(); c.policies[0].reducedSizePlaybooks = ['trend']; c.policies[0].requiredConfirmations = ['review'];
    expect(assess(c)).toMatchObject({ status: 'WAIT_FOR_CONFIRMATION', sizeMultiplier: 0 });
  });
  it('loads saved snapshots and scopes policy reads to the workspace', async () => {
    vi.mocked(q).mockResolvedValue(context().snapshots);
    vi.mocked(listRegimeMatrix).mockResolvedValue([policy()]);
    expect((await loadPaperRegimeContext('w')).policies).toHaveLength(1);
    expect(listRegimeMatrix).toHaveBeenCalledWith('w');
  });
  it('surfaces database failure instead of calling it an empty policy', async () => {
    vi.mocked(q).mockRejectedValueOnce(new Error('database unavailable'));
    await expect(loadPaperRegimeContext('w')).rejects.toThrow('database unavailable');
  });
});

it('dashboard exposes policy absence separately from missing market evidence', () => {
  const c = context(); c.policies = [];
  const summary = paperRegimeSummary(c, 'w', now);
  expect(summary.find(r => r.assetClass === 'crypto')).toMatchObject({ status: 'BLOCKED', reason: 'No playbook policy is configured for this market and regime.' });
  expect(summary.find(r => r.assetClass === 'equity')).toMatchObject({ status: 'BLOCKED', reason: 'No saved regime evidence for this market.' });
});
it('dashboard never lists stale evidence as permission', () => {
  const c = context(); c.snapshots[0].computed_at = new Date(now - 3 * 3600_000).toISOString();
  expect(paperRegimeSummary(c, 'w', now).every(r => r.permittedPlaybooks.length === 0)).toBe(true);
});

it('reports overlapping exclusion causes without changing eligibility', () => {
  const r = rows();
  r[0] = { ...r[0], observedAt: null, changePercent: null };
  r[1] = { ...r[1], fetchedAt: new Date(now - 3 * 3600_000), observedAt: new Date(now - 3 * 3600_000), relVol: NaN };
  r[2].observedAt = new Date(now + 1);
  const evidence = buildMicroEvidence(r, now);
  expect(evidence.components).toMatchObject({ usable: true, symbolCount: 22, universeCount: 25, coverage: 22 / 25,
    diagnosticsVersion: 1, latestObservedAt: at,
    excluded: { missingTimestamp: 1, futureTimestamp: 1, staleFetch: 1, staleObservation: 1, invalidChange: 1, invalidVolume: 1 } });
});
it('keeps stale observations visible diagnostically without treating them as usable', () => {
  const stale = new Date(now - 3 * 3600_000).toISOString();
  const evidence = buildMicroEvidence(rows().map(r => ({ ...r, observedAt: stale })), now);
  expect(evidence).toMatchObject({ microState: 'unknown', components: { usable: false, symbolCount: 0,
    latestObservedAt: stale, sourceOldestAt: null, excluded: { staleObservation: 25 } } });
});
it.each([
  ['2026-09-28T00:52:00Z', 'REGULAR_CLOSED'], // Sunday in New York
  ['2026-09-28T13:29:00Z', 'REGULAR_CLOSED'],
  ['2026-09-28T13:30:00Z', 'REGULAR_OPEN'],
  ['2026-09-28T20:00:00Z', 'REGULAR_CLOSED'],
  ['2026-11-27T17:59:00Z', 'REGULAR_OPEN'], // early close / EST
  ['2026-11-27T18:00:00Z', 'REGULAR_CLOSED'],
])('exposes US session state at %s without granting permission', (date, session) => {
  const summary = paperRegimeSummary({ snapshots: [], policies: [] }, 'w', Date.parse(date));
  expect(summary[0]).toMatchObject({ session, status: 'BLOCKED', symbolCount: null, diagnostics: null, permittedPlaybooks: [] });
  expect(summary[1].session).toBe('CONTINUOUS');
});
it('retains evidence failures and diagnostics outside the regular session', () => {
  const c = context(); c.snapshots[0].asset_class = 'equity';
  const summary = paperRegimeSummary(c, 'w', Date.parse('2026-09-28T00:52:00Z'))[0];
  expect(summary).toMatchObject({ session: 'REGULAR_CLOSED', status: 'BLOCKED', symbolCount: 25, universeCount: 25,
    reason: 'Regime evidence is expired or has invalid timestamps.', permittedPlaybooks: [] });
});
