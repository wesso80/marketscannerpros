// @vitest-environment jsdom
/**
 * PUBLIC_CHART_MODE defaults to safe. A signed-out Symbol response must not
 * carry an OHLC array in the report packet, /api/bars, or the chart HTML.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { cleanup, render, screen } from '@testing-library/react';
import { buildPayload } from '@/lib/goldenEgg/engine';
import { publicChartMode, PUBLIC_CHART_MODE_ENV, presentDailyChart } from '@/lib/research/publicChartMode';
import EquityTop from '@/components/crypto/top/EquityTop';
import { ind, now, price, tc } from './fixtures/goldenEggTiming';

const h = vi.hoisted(() => ({ packet: null as any, session: null as any, actor: null as any }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => h.session) }));
vi.mock('@/lib/proTraderAccess', () => ({ hasPaidSessionAccess: () => true }));
vi.mock('@/lib/publicQuotaAccess', () => ({
  publicQuotaEnabled: () => process.env.PUBLIC_DAILY_QUOTAS_ENABLED === 'true',
  resolvePublicActor: vi.fn(async () => h.actor),
  publicInstrumentKey: (symbol: string) => `equity:${symbol}`,
  publicQuota: { reserve: vi.fn(), settle: vi.fn(async () => true), isUnlocked: vi.fn(async () => false) },
}));
vi.mock('@/lib/goldenEgg/engine', async (orig) => ({
  ...(await orig<typeof import('@/lib/goldenEgg/engine')>()),
  computeGoldenEgg: vi.fn(async () => ({ payload: h.packet, cached: false, localDemo: false, warnings: [], dataQuality: { source: 'fixture' } })),
}));
import { GET } from '@/app/api/golden-egg/route';

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

const call = async () => {
  const res = await GET(new NextRequest('https://msp.test/api/golden-egg?symbol=AAPL&type=equity'));
  return { status: res.status, body: await res.json() };
};

beforeEach(() => {
  cleanup();
  vi.stubGlobal('fetch', vi.fn());
  vi.stubEnv('PUBLIC_DAILY_QUOTAS_ENABLED', 'true');
  vi.stubEnv(PUBLIC_CHART_MODE_ENV, '');
  h.session = null;
  h.actor = { bypass: true, subject: 'visitor:safe', plan: 'visitor' };
  h.packet = buildPayload('AAPL', 'equity', {
    ...price,
    historicalDates: price.historicalCloses!.map((_, i) => new Date(now - (300 - i) * 86400000).toISOString().slice(0, 10)),
    historicalHighs: price.historicalCloses!.map((c) => c + 1),
    historicalLows: price.historicalCloses!.map((c) => c - 1),
  }, ind, null, null, '1D', null, tc, null, { nowMs: now, timeframeKey: 'daily' });
});

describe('public chart mode', () => {
  it('defaults to safe unless the env is raw', () => {
    expect(PUBLIC_CHART_MODE_ENV).toBe('PUBLIC_CHART_MODE');
    expect(publicChartMode({} as NodeJS.ProcessEnv)).toBe('safe');
    expect(publicChartMode({ PUBLIC_CHART_MODE: 'safe' })).toBe('safe');
    expect(publicChartMode({ PUBLIC_CHART_MODE: 'nope' })).toBe('safe');
    expect(publicChartMode({ PUBLIC_CHART_MODE: ' raw ' })).toBe('raw');
  });

  it('keeps bars for a signed-in reader in both modes', () => {
    const chart = h.packet.dailyChart;
    expect(presentDailyChart(chart, true, 'safe')?.bars?.length).toBeGreaterThan(1);
    expect(presentDailyChart(chart, true, 'raw')?.image).toBeUndefined();
  });

  it('gives a signed-out visitor an image in safe mode and bars in raw mode', () => {
    const chart = h.packet.dailyChart;
    const safe = presentDailyChart(chart, false, 'safe');
    expect(safe?.bars).toBeUndefined();
    expect(safe?.image?.startsWith('<svg ')).toBe(true);
    expect(ohlcArrayPaths(safe)).toEqual([]);
    expect(presentDailyChart(chart, false, 'raw')?.bars?.length).toBeGreaterThan(1);
  });
});

describe('signed-out Symbol response in safe mode', () => {
  it('puts no OHLC array in the report packet or the chart HTML', async () => {
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.data.dailyChart.bars).toBeUndefined();
    expect(String(body.data.dailyChart.image).startsWith('<svg ')).toBe(true);
    expect(ohlcArrayPaths(body)).toEqual([]);

    const { container } = render(<EquityTop data={body.data} />);
    await screen.findByRole('img');
    expect(fetch).not.toHaveBeenCalled();
    const html = container.innerHTML;
    expect(html).toContain('<svg ');
    expect(html).not.toMatch(/data-(?:bars|ohlc|candles|series)\s*=/i);
    expect(ohlcArrayPaths(html)).toEqual([]);
    expect(ohlcArrayPaths(body.data)).toEqual([]);
  });

  it('still sends bars to a signed-in reader, and to a signed-out reader in raw mode', async () => {
    h.session = { workspaceId: 'ws-a', tier: 'pro' };
    const signedIn = await call();
    expect(signedIn.body.data.dailyChart.bars.length).toBeGreaterThan(1);

    h.session = null;
    vi.stubEnv(PUBLIC_CHART_MODE_ENV, 'raw');
    const raw = await call();
    expect(raw.body.data.dailyChart.bars.length).toBeGreaterThan(1);
    expect(raw.body.data.dailyChart.image).toBeUndefined();
  });
});
