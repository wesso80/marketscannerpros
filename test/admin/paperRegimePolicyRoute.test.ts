import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m = vi.hoisted(() => ({ auth: vi.fn(), install: vi.fn(), portfolio: vi.fn(), journal: vi.fn(), upsert: vi.fn() }));
vi.mock('@/lib/adminAuth', () => ({ requireAdmin: m.auth }));
vi.mock('@/lib/db', () => ({ q: vi.fn(), atomicQueries: (work: () => Promise<unknown>) => work() }));
vi.mock('@/lib/admin/portfolio-lab/portfolioStore', () => ({ getDefaultPortfolio: m.portfolio }));
vi.mock('@/lib/admin/portfolio-lab/journalEngine', () => ({ writeJournal: m.journal }));
vi.mock('@/lib/admin/portfolio-lab/paperRegimePolicy', async importOriginal => ({ ...await importOriginal<object>(), installMissingPaperPolicies: m.install }));
vi.mock('@/lib/admin/arca-brain/regimePlaybookMatrix', () => ({ getRegimeMatrix: vi.fn(async () => null), upsertRegimeMatrix: m.upsert }));
import { POST } from '@/app/api/admin/portfolio-lab/regime-policy/route';
const request = (body: unknown) => new NextRequest('http://localhost/api/admin/portfolio-lab/regime-policy', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); m.auth.mockResolvedValue({ ok: true, workspaceId: 'owner', cid: 'operator' });
  m.portfolio.mockResolvedValue({ id: 'p', mode: 'SIMULATED' });
  m.install.mockResolvedValue([{ id: 'rule', regime: 'crypto:risk_on', reducedSizePlaybooks: ['TREND_CONTINUATION'], requiredConfirmations: ['long_only'] }]);
  m.journal.mockResolvedValue(undefined); m.upsert.mockImplementation(async p => ({ ...p, id: 'rule' }));
});
it('rejects unauthenticated policy writes', async () => {
  m.auth.mockResolvedValue({ ok: false });
  expect((await POST(request({ action: 'install-missing-baseline' }))).status).toBe(403);
  expect(m.install).not.toHaveBeenCalled();
});
it('uses the authenticated workspace and records installed policies', async () => {
  const response = await POST(request({ action: 'install-missing-baseline', workspaceId: 'someone-else' }));
  expect(response.status).toBe(200);
  expect(m.install).toHaveBeenCalledWith('owner', 'operator');
  expect(m.journal).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'owner', portfolioId: 'p', journalType: 'REVIEW' }));
});
it('does not claim success if the audit write fails', async () => {
  m.journal.mockRejectedValueOnce(new Error('database failed'));
  expect((await POST(request({ action: 'install-missing-baseline' }))).status).toBe(503);
});
it('requires a simulated portfolio and rejects unknown actions or keys', async () => {
  expect((await POST(request({ action: 'stand-down', regime: 'other:unknown' }))).status).toBe(400);
  m.portfolio.mockResolvedValue(null);
  expect((await POST(request({ action: 'install-missing-baseline' }))).status).toBe(503);
  expect(m.install).not.toHaveBeenCalled();
});
it('stand-down removes every allowlist entry from only the named policy', async () => {
  expect((await POST(request({ action: 'stand-down', regime: 'crypto:risk_on' }))).status).toBe(200);
  expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'owner', regime: 'crypto:risk_on', enabledPlaybooks: [], reducedSizePlaybooks: [] }));
});
