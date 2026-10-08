/**
 * /api/midpoints writes candles and resets midpoint tags (Time Gravity Map inputs): admin or cron only, checked before
 * any read or write; server errors carry no internal message. Auth and the midpoint services are fakes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({ admin: false, cron: false, calls: [] as string[], fail: false }));
vi.mock('@/lib/adminAuth', () => ({ requireAdmin: vi.fn(async () => ({ ok: h.admin })), verifyCronAuth: vi.fn(() => h.cron) }));
const rec = (name: string, value: unknown) => async () => { h.calls.push(name); if (h.fail) throw new Error('connect ECONNREFUSED internal-db:5432'); return value; };
vi.mock('@/lib/midpointService', () => ({ getMidpointService: () => ({ getUntaggedMidpoints: rec('get', []), getMidpointStats: rec('stats', {}), resetTaggedMidpoints: rec('reset', 0) }) }));
vi.mock('@/lib/candleProcessor', () => ({ getCandleProcessor: () => ({ processCandle: rec('insert', true), updateTaggingStatus: rec('tag', 0) }) }));
import { DELETE, GET, POST, PUT } from '@/app/api/midpoints/route';

const req = (method: string, body?: unknown, headers: Record<string, string> = {}) => new NextRequest(`https://msp.test/api/midpoints?symbol=BTCUSD&currentPrice=68000`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
const CANDLE = { symbol: 'BTCUSD', timeframe: '1h', candle: { time: 1, open: 1, high: 2, low: 0.5, close: 1.5 } };
beforeEach(() => { h.admin = false; h.cron = false; h.calls = []; h.fail = false; });

describe('/api/midpoints', () => {
  it('refuses anonymous callers on every method before touching data', async () => {
    for (const r of [await GET(req('GET')), await POST(req('POST', CANDLE)), await PUT(req('PUT', { symbol: 'BTCUSD', currentHigh: 2, currentLow: 1 })), await DELETE(req('DELETE'))]) expect(r.status).toBe(401);
    expect(h.calls).toEqual([]);
  });
  it('allows admin, and cron when the cron header is sent', async () => {
    h.admin = true;
    expect((await GET(req('GET'))).status).toBe(200);
    h.admin = false; h.cron = true;
    expect((await DELETE(req('DELETE', undefined, { 'x-cron-secret': 'c' }))).status).toBe(200);
    expect(h.calls).toContain('reset');
  });
  it('server errors carry no internal message', async () => {
    h.admin = true; h.fail = true;
    const r = await GET(req('GET'));
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toMatch(/ECONNREFUSED|internal-db/);
  });
  it('every response (401, 200, 500) is private, no-store and varies by cookie', async () => {
    const anon = await GET(req('GET'));
    h.admin = true;
    const ok = await GET(req('GET'));
    h.fail = true;
    const err = await GET(req('GET'));
    expect([anon.status, ok.status, err.status]).toEqual([401, 200, 500]);
    for (const r of [anon, ok, err]) {
      expect(r.headers.get('cache-control')).toBe('private, no-store, max-age=0');
      expect(r.headers.get('vary')).toBe('Cookie');
    }
  });
});
