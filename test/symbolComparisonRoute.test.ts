import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const h = vi.hoisted(() => ({ session: { workspaceId: 'fixture' } as any, paid: true, fetch: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: async () => h.session }));
vi.mock('@/lib/proTraderAccess', () => ({ hasPaidSessionAccess: () => h.paid }));
vi.mock('@/lib/rateLimit', () => ({ apiLimiter: { check: () => ({ allowed: true }) }, getClientIP: () => 'fixture' }));
vi.mock('@/lib/coingecko', () => ({ COINGECKO_ID_MAP: { BTC: 'bitcoin', ETH: 'ethereum' } }));
vi.mock('@/lib/goldenEggFetchers', () => ({ fetchPrice: h.fetch }));
import { GET } from '@/app/api/symbol-comparison/route';
const call = (query = 'symbol=AAPL&type=equity&days=90') => GET(new NextRequest('http://localhost/api/symbol-comparison?' + query));
beforeEach(() => { h.session = { workspaceId: 'fixture' }; h.paid = true; h.fetch.mockReset().mockResolvedValue(null); });
it('checks login, entitlement and input before history access', async () => {
  h.session = null; expect((await call()).status).toBe(401);
  h.session = { workspaceId: 'fixture' }; h.paid = false; expect((await call()).status).toBe(403);
  h.paid = true; expect((await call('symbol=AAPL&type=equity&days=999')).status).toBe(400);
  expect((await call('symbol=UNMAPPED&type=crypto')).status).toBe(422);
  expect(h.fetch).not.toHaveBeenCalled();
});
it('requests typed equity benchmarks and disables public response caching', async () => {
  const r = await call(); expect(r.headers.get('cache-control')).toBe('private, no-store');
  expect(h.fetch.mock.calls.map(a => a.slice(0, 2))).toEqual([['AAPL', 'equity'], ['SPY', 'equity'], ['QQQ', 'equity']]);
  expect((await r.json()).missing).toHaveLength(4);
});
it('requests BTC for crypto and never requests equity benchmarks', async () => {
  await call('symbol=ETH&type=crypto'); expect(h.fetch.mock.calls.map(a => a.slice(0, 2))).toEqual([['ETH', 'crypto'], ['BTC', 'crypto']]);
});
it('does not echo provider errors', async () => {
  h.fetch.mockRejectedValue(new Error('private diagnostic'));
  const r = await call(); expect(JSON.stringify(await r.json())).not.toContain('private diagnostic');
});

it('projects only price observations and indicators from the selected history',async()=>{
 h.fetch.mockResolvedValue({historicalCloses:[100,102],historicalDates:['2026-10-05','2026-10-06'],source:'fixture',privateScore:99,verdict:'BUY'});
 const body=await (await call()).json();expect(body.price.points[0].close).toBe(100);
 expect(JSON.stringify(body)).not.toContain('privateScore');expect(JSON.stringify(body)).not.toContain('BUY');
});
