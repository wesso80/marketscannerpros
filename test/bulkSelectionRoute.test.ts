import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ marketData: vi.fn(), series: vi.fn(), tier: vi.fn(), query: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: async () => ({ workspaceId: 'test-workspace', tier: 'pro' }) }));
vi.mock('@/lib/entitlements', () => ({ getEffectiveTier: mocks.tier }));
vi.mock('@/lib/adaptiveTrader', () => ({ getAdaptiveLayer: async () => null }));
vi.mock('@/lib/db', () => ({ q: mocks.query }));
vi.mock('@/lib/coingecko', () => ({
  getMarketData: mocks.marketData, getDerivativesForSymbols: async () => [], getOHLC: async () => [],
  COINGECKO_ID_MAP: {}, resolveSymbolToId: async () => null,
}));
vi.mock('@/lib/scanner/cryptoBars', () => ({ fetchCryptoSeries: mocks.series }));
import { POST } from '@/app/api/scanner/bulk/route';

const request = (body: Record<string, unknown>) => new NextRequest('https://example.test/api/scanner/bulk', {
  method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
});

describe('bulk scanner filter contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tier.mockResolvedValue('pro');
    mocks.marketData.mockResolvedValue(Array.from({ length: 12 }, (_, i) => ({
      symbol: `asset${i}`, current_price: 100, market_cap: 1_000_000_000, market_cap_rank: 500,
      total_volume: i === 11 ? 10_000_000 : 100_000_000,
      price_change_percentage_24h: i === 11 ? -1 : 15,
      price_change_percentage_7d_in_currency: i === 11 ? -1 : 15,
    })));
  });

  it('retains and filters candidates outside the ten enriched leaders', async () => {
    const res = await POST(request({ type: 'crypto', mode: 'light', universeSize: 12, filters: {} }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.topPicks.map((p: { symbol: string }) => p.symbol)).toContain('ASSET11');
    expect(data.selection).toMatchObject({ evaluated: 12, matched: 12, returned: 12, excluded: 0 });
    const unobserved = data.topPicks.find((p: { symbol: string }) => p.symbol === 'ASSET11');
    expect(unobserved.compositeV2.permission).toBe('BLOCK');
    expect(unobserved.direction).toBe('neutral'); // A one-day return is not a technical short setup.
    expect(mocks.marketData).toHaveBeenCalledWith(expect.objectContaining({ per_page: 12 }), { retries: 0, timeoutMs: 5000 });
    expect(data.topPicks[0].entry).toBeUndefined();
    expect(data.topPicks[0].stop).toBeUndefined();
  });

  it('reports missing volatility inputs instead of passing them through a low-volatility filter', async () => {
    const data = await (await POST(request({ type: 'crypto', mode: 'light', universeSize: 12, filters: { volatility: 'low' } }))).json();
    expect(data.topPicks).toEqual([]);
    expect(data.selection).toMatchObject({ evaluated: 12, matched: 0, unavailable: 12, exclusions: { 'ATR unavailable': 12 } });
  });

  it('keeps market candidates when enrichment fails and uses the provider coin identity with bounded reads', async () => {
    mocks.marketData.mockResolvedValue([{ id: 'provider-coin', symbol: 'collision', current_price: 100,
      market_cap: 1_000_000_000, market_cap_rank: 50, total_volume: 100_000_000,
      price_change_percentage_24h: 10, price_change_percentage_7d_in_currency: 10 }]);
    mocks.series.mockRejectedValue(new Error('Provider timeout'));
    const data = await (await POST(request({ type: 'crypto', mode: 'light', universeSize: 100, filters: {} }))).json();
    expect(data.topPicks).toHaveLength(1);
    expect(data.topPicks[0].indicators.rsi).toBeUndefined();
    expect(data.universe.enrichment).toEqual({ attempted: 1, completed: 0, unavailable: 1 });
    expect(mocks.series).toHaveBeenCalledWith('COLLISION', 'daily', expect.any(Number), {
      coinId: 'provider-coin', requestOptions: { retries: 0, timeoutMs: 4000 },
    });
  });

  it('rejects invalid filters before fetching data', async () => {
    const res = await POST(request({ type: 'crypto', mode: 'light', filters: { minConfidence: 'high' } }));
    expect(res.status).toBe(400);
    expect(mocks.marketData).not.toHaveBeenCalled();
  });
});
