/** /api/scanner/candidates is retired: 410 with no detail, and the database is never read. */
import { expect, it, vi } from 'vitest';
const { q } = vi.hoisted(() => ({ q: vi.fn() }));
vi.mock('@/lib/db', () => ({ q }));
it('returns 410 without reading daily picks or exposing levels', async () => {
  const { GET } = await import('@/app/api/scanner/candidates/route');
  const r = await GET();
  expect(r.status).toBe(410);
  expect(await r.json()).toEqual({ error: 'This endpoint has been retired.', retired: true });
  expect(q).not.toHaveBeenCalled();
});
