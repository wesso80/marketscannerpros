import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const q = vi.hoisted(() => vi.fn(async (_sql: string) => [] as Record<string, unknown>[]));
vi.mock('@/lib/db', () => ({ q }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: async () => ({ workspaceId: 'ws-1' }) }));

const quoteRow = {
  symbol: 'AAPL', price: 150, change_amount: 1, change_percent: 1, volume: 1,
  latest_trading_day: '2026-10-02', fetched_at: new Date().toISOString(),
  rsi14: 55, macd_hist: 0.1, ema200: 140, adx14: 30, stoch_k: 60, atr14: 2, macd_line: 1, macd_signal: 0.5,
};

beforeEach(() => { q.mockReset(); });

it('loads each asset class from its own latest scan_date, not one global MAX', async () => {
  const sqls: string[] = [];
  q.mockImplementation(async (sql: string) => {
    sqls.push(sql);
    return sql.includes('quotes_latest') ? [quoteRow] : [];
  });
  const { GET } = await import('@/app/api/scanner/top-cached/route');
  const res = await GET(new NextRequest('https://test/api/scanner/top-cached'));
  expect(res.status).toBe(200);
  const canonical = sqls.find((sql) => sql.includes("indicators->'canonical'"));
  expect(canonical).toBeTruthy();
  expect(canonical).toContain('d.asset_class = dp.asset_class');
  expect(canonical).not.toContain('SELECT MAX(scan_date) FROM daily_picks)');

  sqls.length = 0;
  q.mockImplementation(async (sql: string) => { sqls.push(sql); return []; });
  await GET(new NextRequest('https://test/api/scanner/top-cached'));
  const fallback = sqls.find((sql) => sql.includes('WITH latest'));
  expect(fallback).toBeTruthy();
  expect(fallback).toContain('GROUP BY asset_class');
  expect(fallback).toContain('dp.asset_class = l.asset_class');
});
