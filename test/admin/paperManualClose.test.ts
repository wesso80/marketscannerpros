import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/adminAuth', () => ({ requireAdmin: vi.fn(async () => ({ ok: true, workspaceId: 'w' })) }));
vi.mock('@/lib/db', () => ({ q: vi.fn(), atomicQueries: vi.fn(async (work: () => Promise<unknown>) => work()) }));
vi.mock('@/lib/admin/portfolio-lab/portfolioStore', () => ({ getDefaultPortfolio: vi.fn(), getPortfolioById: vi.fn(), listOpenPositions: vi.fn() }));
vi.mock('@/lib/admin/portfolio-lab/positionEngine', () => ({ manualSimClose: vi.fn() }));
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/admin/portfolio-lab/positions/route';
import { atomicQueries, q } from '@/lib/db';
import * as store from '@/lib/admin/portfolio-lab/portfolioStore';
import { manualSimClose } from '@/lib/admin/portfolio-lab/positionEngine';
const request = (price = 100) => new NextRequest('http://localhost/api/admin/portfolio-lab/positions', {
  method: 'POST', body: JSON.stringify({ positionId: 'pos', exitPrice: price }),
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(store.getDefaultPortfolio).mockResolvedValue({ id: 'p', currentCash: 0 } as never);
  vi.mocked(store.getPortfolioById).mockResolvedValue({ id: 'p', mode: 'SIMULATED', currentCash: 123 } as never);
  vi.mocked(store.listOpenPositions).mockResolvedValue([{ id: 'pos' }] as never);
  vi.mocked(manualSimClose).mockResolvedValue({ id: 't' } as never);
});
it('locks the portfolio and closes with balances re-read inside the transaction', async () => {
  expect((await POST(request())).status).toBe(200);
  expect(atomicQueries).toHaveBeenCalledOnce();
  expect(q).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'), ['w', 'p']);
  expect(vi.mocked(q).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(store.getPortfolioById).mock.invocationCallOrder[0]);
  expect(vi.mocked(store.getPortfolioById).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(store.listOpenPositions).mock.invocationCallOrder[0]);
  expect(manualSimClose).toHaveBeenCalledWith(expect.objectContaining({ portfolio: expect.objectContaining({ currentCash: 123 }) }));
});
it('does not repeat a close already completed while waiting for the lock', async () => {
  vi.mocked(store.listOpenPositions).mockResolvedValue([]);
  expect((await POST(request())).status).toBe(404);
  expect(manualSimClose).not.toHaveBeenCalled();
});
it.each([0, -1])('rejects an invalid exit price %s before opening a transaction', async price => {
  expect((await POST(request(price))).status).toBe(400);
  expect(atomicQueries).not.toHaveBeenCalled();
});
it('propagates a ledger failure to the transaction instead of swallowing it', async () => {
  vi.mocked(manualSimClose).mockRejectedValueOnce(new Error('write failed'));
  await expect(POST(request())).rejects.toThrow('write failed');
});
