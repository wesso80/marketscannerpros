import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ admin: true, marketData: vi.fn(), series: vi.fn(), tier: vi.fn(), query: vi.fn() }));
vi.mock('@/lib/adminAuth', () => ({ requireAdmin: async () => ({ ok: mocks.admin }) }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: async () => ({ workspaceId: 'test-workspace', tier: 'pro' }) }));
vi.mock('@/lib/entitlements', () => ({ getEffectiveTier: mocks.tier }));
vi.mock('@/lib/adaptiveTrader', () => ({ getAdaptiveLayer: async () => null }));
vi.mock('@/lib/db', () => ({ q: mocks.query }));
vi.mock('@/lib/scoring/canonical/regimeOverlayData', () => ({ loadRegimeOverlayInputs: async () => null }));
vi.mock('@/lib/coingecko', () => ({
  getMarketData: mocks.marketData, getDerivativesForSymbols: async () => [], getOHLC: async () => [],
  COINGECKO_ID_MAP: {}, resolveSymbolToId: async (symbol: string) => `${symbol.toLowerCase()}-coin`,
}));
vi.mock('@/lib/scanner/cryptoBars', () => ({ fetchCryptoSeries: mocks.series }));
// Regime overlay would otherwise download the Cboe VIX CSV, a FRED CSV, and Alpha Vantage daily bars.
vi.mock('@/lib/macro/cboeVix', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/macro/cboeVix')>();
  return {
    ...actual,
    getCboeVixDailyCached: async () => [
      { on: '2026-10-08', value: 16.5 },
      { on: '2026-10-07', value: 16.2 },
      { on: '2026-10-06', value: 16.0 },
      { on: '2026-10-03', value: 15.8 },
      { on: '2026-10-02', value: 15.9 },
      { on: '2026-10-01', value: 16.1 },
    ],
  };
});
vi.mock('@/lib/macro/fredCsv', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/macro/fredCsv')>();
  return {
    ...actual,
    getFredCsvCached: async () => [
      { date: '2026-09-10', value: '3.10' },
      { date: '2026-10-08', value: '3.25' },
    ],
  };
});
vi.mock('@/lib/marketData/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/marketData/client')>();
  return { ...actual, avFetchDailyBars: async () => null };
});
import { POST } from '@/app/api/scanner/bulk/route';

const request = (body: Record<string, unknown>) => new NextRequest('https://example.test/api/scanner/bulk', {
  method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
});

const DAY_MS = 86_400_000;
/** 260 completed daily bars ending yesterday, gentle uptrend, liquid volume (synthetic, not market data). */
function syntheticSeries(symbol: string, coinId: string) {
  const start = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) - 260 * DAY_MS; // ends yesterday (fresh)
  const bars = Array.from({ length: 260 }, (_, i) => {
    const close = 100 + i * 0.4 + Math.sin(i / 3) * 1.5;
    return { t: new Date(start + i * DAY_MS).toISOString(), open: close - 0.5, high: close + 1.2, low: close - 1.2, close, volume: 50_000_000 + (i % 7) * 1_000_000 };
  });
  return { symbol, bars, barInterval: '1d', lastCompletedBarAt: bars[bars.length - 1].t, volumeBasis: 'market_chart_24h', coinId };
}

describe('retained admin bulk scanner (crypto is Deep-only)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.admin = true;
    mocks.tier.mockResolvedValue('pro');
    mocks.query.mockResolvedValue([{ symbol: 'AAA' }, { symbol: 'BBB' }, { symbol: 'CCC' }]);
    mocks.marketData.mockResolvedValue([]);
    mocks.series.mockImplementation(async (symbol: string, _tf: string, _now: number, opts: { coinId: string }) => syntheticSeries(symbol, opts.coinId));
  });

  it('runs a leftover Fast (light) crypto request as a Deep scan instead of the retired market-data ranking', async () => {
    const res = await POST(request({ type: 'crypto', mode: 'light', universeSize: 500, filters: {} }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.mode).toBe('deep');
    expect(data.modeNote).toMatch(/Fast scan has been retired/);
    expect(data.universe.mode).toBe('deep');
    // Deep pulls real candles for EVERY symbol in the curated universe, not just ten leaders.
    expect(mocks.series).toHaveBeenCalledTimes(3);
    // The retired Fast path paged /coins/markets with 1h/24h/7d price changes; Deep never does.
    expect(mocks.marketData).not.toHaveBeenCalledWith(expect.objectContaining({ price_change_percentage: expect.anything() }), expect.anything());
    expect(data.selection).toMatchObject({ evaluated: 3 });
    for (const pick of data.topPicks) {
      expect(Number.isFinite(pick.indicators.rsi)).toBe(true);
      expect(Number.isFinite(pick.indicators.atr)).toBe(true);
      expect(pick.canonical).toBeTruthy();
    }
  });

  it('keeps every candidate evaluable by the default factor-agreement filter (Fast used to drop them all)', async () => {
    const data = await (await POST(request({ type: 'crypto', mode: 'light', filters: { minAlignment: 2 } }))).json();
    expect(data.selection.exclusions['Factor inputs unavailable'] ?? 0).toBe(0);
    expect(data.selection.unavailable).toBe(0);
  });

  it('does not add a retirement note to normal Deep requests', async () => {
    const data = await (await POST(request({ type: 'crypto', mode: 'deep', filters: {} }))).json();
    expect(data.mode).toBe('deep');
    expect(data.modeNote).toBeUndefined();
  });

  it('accounts for provider failures instead of inventing rows', async () => {
    mocks.series.mockRejectedValue(new Error('Provider timeout'));
    const data = await (await POST(request({ type: 'crypto', mode: 'deep', filters: {} }))).json();
    expect(data.topPicks).toEqual([]);
    expect(data.universe.excluded).toHaveLength(3);
    expect(data.universe.excluded.every((x: { reason: string }) => x.reason === 'provider_no_data')).toBe(true);
  });

  it('rejects invalid filters before fetching data', async () => {
    const res = await POST(request({ type: 'crypto', mode: 'light', filters: { minConfidence: 'high' } }));
    expect(res.status).toBe(400);
    expect(mocks.marketData).not.toHaveBeenCalled();
    expect(mocks.series).not.toHaveBeenCalled();
  });

  it('still refuses free users', async () => {
    mocks.tier.mockResolvedValue('free');
    const res = await POST(request({ type: 'crypto', mode: 'deep', filters: {} }));
    expect(res.status).toBe(403);
    expect(mocks.series).not.toHaveBeenCalled();
  });
});

it('refuses a paid app session without verified admin access before any scan work', async () => {
  vi.clearAllMocks(); mocks.admin = false;
  const response = await POST(request({ type: 'crypto', mode: 'deep', internal: true }));
  expect(response.status).toBe(403);
  expect(response.headers.get('cache-control')).toContain('private, no-store');
  expect(await response.json()).toEqual({ error: 'This scanner is restricted to administrators.', replacement: '/tools/golden-egg?view=find' });
  expect(mocks.query).not.toHaveBeenCalled();
  expect(mocks.series).not.toHaveBeenCalled();
  expect(mocks.marketData).not.toHaveBeenCalled();
});

it('fails closed when authorization is unavailable', async () => {
  const { adminBulkHandler } = await import('@/lib/scanner/adminBulkBoundary');
  const run = vi.fn();
  const handler = adminBulkHandler(async () => { throw new Error('private auth detail'); }, run);
  const response = await handler(request({ type: 'crypto' }));
  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(await response.text()).not.toContain('private auth detail');
  expect(run).not.toHaveBeenCalled();
});
