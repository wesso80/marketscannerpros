/** Market Focus is retired: every route answers 410 without SQL, model or market-data work, and no job schedules it. */
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
const { q } = vi.hoisted(() => ({ q: vi.fn() }));
vi.mock('@/lib/db', () => ({ q }));

it.each([
  ['market-focus/generate POST', async () => (await import('@/app/api/market-focus/generate/route')).POST()],
  ['market-focus/candidates GET', async () => (await import('@/app/api/market-focus/candidates/route')).GET()],
  ['jobs/generate-market-focus GET', async () => (await import('@/app/api/jobs/generate-market-focus/route')).GET()],
  ['jobs/generate-market-focus POST', async () => (await import('@/app/api/jobs/generate-market-focus/route')).POST()],
])('%s returns 410 with no work', async (_name, call) => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  const r = await call();
  expect(r.status).toBe(410);
  expect(r.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  expect(await r.json()).toEqual({ error: 'This endpoint has been retired.', retired: true });
  expect(q).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled();
  fetchSpy.mockRestore();
});

it('no worker job schedules Market Focus', () => {
  expect(readFileSync('lib/worker/schedule.ts', 'utf8')).not.toContain('market-focus');
});
