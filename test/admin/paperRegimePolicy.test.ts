import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/db', () => ({ q: vi.fn() }));
import { q } from '@/lib/db';
import { baselinePaperPolicies, installMissingPaperPolicies } from '@/lib/admin/portfolio-lab/paperRegimePolicy';
import { assessPaperRegime, paperRegimeSummary, type PaperRegimeContext } from '@/lib/admin/portfolio-lab/paperRegime';
import type { EdgePacketRow } from '@/lib/admin/edgePacketSnapshots';
const now = Date.parse('2026-09-28T00:00:00Z'), at = new Date(now - 1000).toISOString();
function context(regime = 'risk_on'): PaperRegimeContext {
  return { snapshots: [{ asset_class: 'crypto', micro_state: regime, computed_at: at,
    components_json: { evidenceVersion: 1, usable: true, symbolCount: 25, coverage: 1, sourceOldestAt: at } }],
    policies: baselinePaperPolicies('w', 'operator').map((p, i) => ({ ...p, id: `policy-${i}`, createdAt: at, updatedAt: at })) };
}
function row(short = false): EdgePacketRow {
  return { assetClass: 'crypto', setupType: 'TREND_CONTINUATION', packetJson: {
    bias: short ? 'SHORT' : 'LONG', generatedAt: at, staleAfter: new Date(now + 899000).toISOString(), priceAt: at, price: 100,
    positionLevels: { status: 'ok', timeframe: '1W/1D', direction: short ? 'SHORT' : 'LONG', entryStatus: 'in_zone',
      entryTrigger: 100, entryZoneLow: 99, entryZoneHigh: 101, stop: short ? 110 : 90, tp1: short ? 80 : 120,
      dailyAsOf: '2026-09-27', minRewardR: 1.5, belowMinR: false },
  } } as EdgePacketRow;
}
const assess = (c: PaperRegimeContext, r?: EdgePacketRow) => assessPaperRegime(c, 'w', 'crypto', 'TREND_CONTINUATION', now, r);
beforeEach(() => vi.clearAllMocks());
it('defines six exact market/regime keys with risk-on reduced size and otherwise stand-down', () => {
  const policies = baselinePaperPolicies('w', 'operator');
  expect(policies).toHaveLength(6);
  expect(policies.every(p => p.enabledPlaybooks.length === 0)).toBe(true);
  expect(policies.filter(p => p.reducedSizePlaybooks.length).map(p => p.regime)).toEqual(['equity:risk_on', 'crypto:risk_on']);
});
it('allows a validated long position at half regime size', () => {
  expect(assess(context(), row())).toMatchObject({ status: 'REDUCE_SIZE', sizeMultiplier: 0.5, requiredConfirmations: [] });
});
it('cannot use a valid short or missing evidence to satisfy long-only policy', () => {
  expect(assess(context(), row(true))).toMatchObject({ status: 'WAIT_FOR_CONFIRMATION', requiredConfirmations: ['long_only'], sizeMultiplier: 0 });
  expect(assess(context())).toMatchObject({ status: 'WAIT_FOR_CONFIRMATION', sizeMultiplier: 0 });
});
it.each(['neutral', 'risk_off'])('does not authorize entries in %s', regime => {
  expect(assess(context(regime), row())).toMatchObject({ status: 'DISABLED', sizeMultiplier: 0 });
});
it('rechecks freshness and entry geometry instead of accepting a saved confirmation', () => {
  const stale = row(); stale.packetJson.priceAt = '2026-09-20T00:00:00Z';
  const chased = row(); chased.packetJson.price = 110;
  for (const r of [stale, chased]) expect(assess(context(), r).sizeMultiplier).toBe(0);
});
it('does not accept a different asset or playbook as confirmation evidence', () => {
  const foreign = row(); foreign.assetClass = 'equity';
  expect(assess(context(), foreign).sizeMultiplier).toBe(0);
  foreign.assetClass = 'crypto'; foreign.setupType = 'BREAKOUT';
  expect(assess(context(), foreign).sizeMultiplier).toBe(0);
});
it('unknown confirmation requirements remain blocking', () => {
  const c = context(); c.policies.find(p => p.regime === 'crypto:risk_on')!.requiredConfirmations.push('human_review');
  expect(assess(c, row())).toMatchObject({ status: 'WAIT_FOR_CONFIRMATION', requiredConfirmations: ['human_review'] });
});
it('shows conditional permission and deliberate stand-down separately from missing configuration', () => {
  expect(paperRegimeSummary(context(), 'w', now).find(p => p.assetClass === 'crypto'))
    .toMatchObject({ status: 'CONDITIONAL', policyConfigured: true, conditionalPlaybooks: ['TREND_CONTINUATION'], permittedPlaybooks: [] });
  expect(paperRegimeSummary(context('risk_off'), 'w', now).find(p => p.assetClass === 'crypto')?.reason).toContain('Configured stand-down');
  const c = context(); c.policies = [];
  expect(paperRegimeSummary(c, 'w', now).find(p => p.assetClass === 'crypto')?.policyConfigured).toBe(false);
});
it('installs missing keys in one workspace-scoped insert without overwriting existing operator policies', async () => {
  vi.mocked(q).mockResolvedValue([]);
  expect(await installMissingPaperPolicies('w', 'operator')).toEqual([]);
  const [sql, values] = vi.mocked(q).mock.calls[0];
  expect(sql).toContain('ON CONFLICT (workspace_id, regime) DO NOTHING');
  expect(values?.[0]).toBe('w'); expect(values?.[2]).toBe('operator');
  expect(JSON.parse(values?.[1] as string)).toHaveLength(6);
});
