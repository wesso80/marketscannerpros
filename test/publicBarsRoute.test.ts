import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  session: null as null | { workspaceId: string },
  rows: [] as Array<{ ts: string; open: number; high: number; low: number; close: number; volume: number }>,
  unlocked: false,
  actor: null as null | { bypass: boolean; subject: string; plan: 'visitor' },
  avCalls: 0,
  queries: 0,
}));

vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => h.session) }));
vi.mock('@/lib/db', () => ({ q: vi.fn(async () => { h.queries += 1; return h.rows; }) }));
vi.mock('@/lib/redis', () => ({
  getCached: vi.fn(async () => null),
  setCached: vi.fn(async () => undefined),
  CACHE_KEYS: {},
  CACHE_TTL: { bars: 300 },
}));
vi.mock('@/lib/avRateGovernor', () => ({ avTryToken: vi.fn(async () => { h.avCalls += 1; return false; }) }));
vi.mock('@/lib/publicQuotaAccess', () => ({
  publicQuotaEnabled: () => process.env.PUBLIC_DAILY_QUOTAS_ENABLED === 'true',
  resolvePublicActor: vi.fn(async () => h.actor),
  publicInstrumentKey: (symbol: string, asset: string) => `${asset}:${symbol}`,
  publicQuota: { isUnlocked: vi.fn(async () => h.unlocked) },
}));
vi.mock('@/lib/indicators', () => ({ calculateAllIndicators: () => ({}) }));

import { GET } from '@/app/api/bars/route';

const bar = (t: string, c: number) => ({ ts: t, open: c, high: c + 1, low: c - 1, close: c, volume: 10 });
let ip = 20;
const call = (qs: string) => GET(new NextRequest(`https://msp.test/api/bars?${qs}`, { headers: { 'x-forwarded-for': `203.0.113.${ip++}` } }));

beforeEach(() => {
  h.session = null;
  h.rows = [];
  h.unlocked = false;
  h.actor = null;
  h.avCalls = 0;
  h.queries = 0;
  vi.stubEnv('PUBLIC_DAILY_QUOTAS_ENABLED', 'true');
  vi.stubEnv('PUBLIC_CHART_MODE', 'raw');
});

describe('signed-out /api/bars', () => {
  it('stays logged-in only when public quotas are off', async () => {
    vi.stubEnv('PUBLIC_DAILY_QUOTAS_ENABLED', 'false');
    const res = await call('symbol=AAPL&timeframe=daily&limit=140');
    expect(res.status).toBe(401);
    expect(h.avCalls).toBe(0);
    expect(h.queries).toBe(0);
  });

  it('does not call Alpha Vantage for a visitor, and returns stored bars after the report is open', async () => {
    h.actor = null;
    expect((await call('symbol=AAPL&timeframe=daily')).status).toBe(401);

    h.actor = { bypass: false, subject: 'visitor:1', plan: 'visitor' };
    h.unlocked = false;
    expect((await call('symbol=AAPL&timeframe=daily')).status).toBe(403);

    h.unlocked = true;
    h.rows = [bar('2026-10-09', 250), bar('2026-10-08', 248)];
    const ok = await call('symbol=AAPL&timeframe=daily&limit=140');
    const body = await ok.json();
    expect(ok.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.candles.map((c: { t: string }) => c.t)).toEqual(['2026-10-08', '2026-10-09']);
    expect(body.source).toBe('database');

    h.rows = [];
    const empty = await call('symbol=AAPL&timeframe=daily');
    expect(empty.status).toBe(200);
    expect(await empty.json()).toMatchObject({ ok: true, candles: [], source: 'none' });
    expect(h.avCalls).toBe(0);
  });

  it('serves signed-out visitors the daily timeframe only', async () => {
    h.actor = { bypass: false, subject: 'visitor:1', plan: 'visitor' };
    h.unlocked = true;
    h.rows = [bar('2026-10-09', 250), bar('2026-10-08', 248)];
    const weekly = await call('symbol=AAPL&timeframe=weekly&limit=140');
    expect(weekly.status).toBe(401);
    expect(JSON.stringify(await weekly.json())).not.toMatch(/"candles"/);
    expect(h.queries).toBe(0);
    expect(h.avCalls).toBe(0);

    const daily = await call('symbol=AAPL&timeframe=daily&limit=140');
    expect(daily.status).toBe(200);
    expect((await daily.json()).candles).toHaveLength(2);
    expect(h.queries).toBe(1);
  });

  it('still lets a signed-in miss fall through to the Alpha Vantage token', async () => {
    vi.stubEnv('ALPHA_VANTAGE_API_KEY', 'test-key');
    h.session = { workspaceId: 'ws' };
    const res = await call('symbol=AAPL&timeframe=daily');
    expect(res.status).toBe(404);
    expect(h.avCalls).toBe(1);
  });

  it('still reads stored bars for a signed-in reader when the public chart mode is safe', async () => {
    vi.stubEnv('PUBLIC_CHART_MODE', 'safe');
    h.session = { workspaceId: 'ws' };
    h.rows = [bar('2026-10-09', 250)];
    const res = await call('symbol=AAPL&timeframe=weekly');
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.candles).toHaveLength(1);
    expect(body.source).toBe('database');
  });
});

describe('signed-out /api/bars in safe mode', () => {
  it('is disabled and the body has no OHLC array', async () => {
    vi.stubEnv('PUBLIC_CHART_MODE', 'safe');
    h.actor = { bypass: true, subject: 'visitor:1', plan: 'visitor' };
    h.unlocked = true;
    h.rows = [bar('2026-10-09', 250), bar('2026-10-08', 248)];
    const res = await call('symbol=AAPL&timeframe=daily&limit=140');
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.candles).toBeUndefined();
    expect(ohlcArrayPaths(body)).toEqual([]);
    expect(h.queries).toBe(0);
    expect(h.avCalls).toBe(0);
  });
});

function hasOhlcShape(item: unknown): boolean {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  const keys = new Set(Object.keys(item));
  return (keys.has('h') && keys.has('l') && keys.has('c')) || (keys.has('high') && keys.has('low') && keys.has('close'));
}

function ohlcArrayPaths(value: unknown, path = '$'): string[] {
  const hits: string[] = [];
  const walk = (v: unknown, p: string) => {
    if (typeof v === 'string') {
      if (/data-(?:bars|ohlc|candles|series)\s*=/i.test(v)) hits.push(p);
      if (/\[\s*\{[^[\]]{0,500}"(?:h|high)"\s*:/.test(v)) hits.push(p);
      return;
    }
    if (Array.isArray(v)) {
      if (v.length > 0 && v.every(hasOhlcShape)) hits.push(p);
      v.forEach((item, i) => walk(item, `${p}[${i}]`));
      return;
    }
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${p}.${k}`);
  };
  walk(value, path);
  return hits;
}
