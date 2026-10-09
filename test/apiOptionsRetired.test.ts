/** /api/options is retired: 410 with no detail and private headers, for both methods. */
import { expect, it } from 'vitest';
import { GET, POST } from '@/app/api/options/route';

it.each([['GET', GET], ['POST', POST]] as const)('%s returns 410 with no redirect detail', async (_method, handler) => {
  const r = await handler();
  expect(r.status).toBe(410);
  expect(r.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  expect(await r.json()).toEqual({ error: 'This endpoint has been retired.', retired: true });
});
