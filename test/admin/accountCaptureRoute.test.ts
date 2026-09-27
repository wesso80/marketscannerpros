import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/admin/risk/capture/route';
import { requireAdmin } from '@/lib/adminAuth';
import { enableAccountCapture } from '@/lib/portfolio/serverCapture';
vi.mock('@/lib/adminAuth', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/portfolio/serverCapture', () => ({ enableAccountCapture: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
it('requires authenticated admin access', async () => {
  vi.mocked(requireAdmin).mockResolvedValue({ ok: false });
  expect((await POST(new NextRequest('https://example.test/api/admin/risk/capture', { method: 'POST' }))).status).toBe(403);
  expect(enableAccountCapture).not.toHaveBeenCalled();
});
it('takes the account only from authenticated identity, ignoring caller-supplied workspace', async () => {
  vi.mocked(requireAdmin).mockResolvedValue({ ok: true, workspaceId: 'own-account' });
  vi.mocked(enableAccountCapture).mockResolvedValue({ status: 'captured', date: '2026-09-27' });
  const response = await POST(new NextRequest('https://example.test/api/admin/risk/capture?workspaceId=other', { method: 'POST', body: JSON.stringify({ workspaceId: 'other' }) }));
  expect(response.status).toBe(200);
  expect(enableAccountCapture).toHaveBeenCalledWith('own-account');
});
