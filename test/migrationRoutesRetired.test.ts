/** The schema-migration web routes are retired: 410 for every caller (with or without a key), and no SQL runs. */
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
const { q } = vi.hoisted(() => ({ q: vi.fn() }));
vi.mock('@/lib/db', () => ({ q }));

it.each([
  ['daily-picks', async () => (await import('@/app/api/migrations/daily-picks/route')).GET()],
  ['market-focus', async () => (await import('@/app/api/migrations/market-focus/route')).POST()],
])('%s returns 410 without running SQL', async (_name, call) => {
  const r = await call();
  expect(r.status).toBe(410);
  expect(r.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  expect(await r.json()).toEqual({ error: 'This endpoint has been retired.', retired: true });
  expect(q).not.toHaveBeenCalled();
});

it('keeps both schemas in SQL migrations', () => {
  expect(readFileSync('migrations/008_daily_picks.sql', 'utf8')).toContain('CREATE TABLE IF NOT EXISTS daily_picks');
  const focus = readFileSync('migrations/129_daily_market_focus.sql', 'utf8');
  expect(focus).toContain('CREATE TABLE IF NOT EXISTS daily_market_focus (');
  expect(focus).toContain('CREATE TABLE IF NOT EXISTS daily_market_focus_items');
});
