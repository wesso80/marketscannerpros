import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match';
import nextConfig from '../next.config.mjs';

const state = vi.hoisted(() => ({
  session: { workspaceId: 'ws1' } as { workspaceId?: string } | null,
  paid: true,
  quotaOn: false,
  redisUp: true,
  store: new Map<string, unknown>(),
  marketCalls: 0,
  marketError: null as Error | null,
  defiCalls: 0,
  categoryCalls: 0,
  oiCalls: 0,
  computeCalls: 0,
  asOf: '2026-10-10T12:00:00.000Z',
  stale: true,
  market: [{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', current_price: 100, price_change_24h: 1, price_change_percentage_24h: 1, total_volume: 10, market_cap: 1000 }] as unknown[] | null,
  categories: [{ id: 'layer-1', name: 'Layer 1', market_cap: 1, market_cap_change_24h: 1, volume_24h: 1, top_3_coins: [], updated_at: '2026-10-10T11:00:00.000Z' }] as unknown[] | null,
  resolve: vi.fn(),
  reserve: vi.fn(),
  settle: vi.fn(),
  gate: null as Promise<void> | null,
}));

vi.mock('@/lib/auth', () => ({ getSessionFromCookie: async () => state.session }));
vi.mock('@/lib/proTraderAccess', () => ({ hasPaidSessionAccess: () => state.paid }));
vi.mock('@/lib/redis', () => ({
  getCached: async (key: string) => (state.redisUp ? state.store.get(key) ?? null : null),
  getCachedMulti: async (keys: string[]) => keys.map((key) => (state.redisUp ? state.store.get(key) ?? null : null)),
  setCached: async (key: string, value: object, _ttl: number) => {
    if (!state.redisUp) return false;
    state.store.set(key, { ...value, _ts: 1 });
    return true;
  },
}));
vi.mock('@/lib/coingecko', () => ({
  getMarketData: async () => {
    state.marketCalls += 1;
    if (state.gate) await state.gate;
    if (state.marketError) throw state.marketError;
    return state.market;
  },
  getDefiData: async () => {
    state.defiCalls += 1;
    return { tvl: 1 };
  },
  getCoinCategories: async () => {
    state.categoryCalls += 1;
    return state.categories;
  },
  buildCoinGeckoResponseMeta: (opts: { lastUpdated?: string | null }) => ({
    provider: 'coingecko',
    lastUpdated: opts.lastUpdated ?? state.asOf,
    freshnessStatus: state.stale ? 'stale' : 'fresh',
    stale: state.stale,
  }),
}));
vi.mock('@/lib/crypto/oiHistory', () => ({
  getOiEvidence: async () => {
    state.oiCalls += 1;
    return { coins: [] };
  },
}));
vi.mock('@/lib/publicQuotaAccess', () => ({
  publicQuotaEnabled: () => state.quotaOn,
  resolvePublicActor: (...args: unknown[]) => state.resolve(...args),
  publicInstrumentKey: (symbol: string) => `equity:${symbol}`,
  publicQuota: {
    reserve: (...args: unknown[]) => state.reserve(...args),
    settle: (...args: unknown[]) => state.settle(...args),
  },
}));
vi.mock('@/lib/goldenEggFetchers', () => ({ detectAssetClass: () => 'equity' }));
vi.mock('@/lib/goldenEgg/engine', () => ({
  computeGoldenEgg: async () => {
    state.computeCalls += 1;
    return {
      payload: { meta: { asOfTs: state.asOf }, stale: state.stale, canonical: { symbol: 'AAPL' } },
      cached: false,
      localDemo: false,
      warnings: [],
      dataQuality: { source: 'fixture', stale: state.stale },
    };
  },
  tfLabelFor: () => '1D',
  isLocalGoldenEggDemoAllowed: () => false,
  buildLocalDemoGoldenEggPayload: () => ({}),
  goldenEggDemoDataQuality: () => ({}),
}));
vi.mock('@/lib/research/publicSymbolPacket', () => ({
  toPublicSymbolPacket: (payload: { meta?: { asOfTs?: string }; stale?: boolean }) => ({
    ...payload,
    asOf: payload?.meta?.asOfTs ?? null,
    stale: payload?.stale === true,
  }),
}));

import { clearShortResponseCache, loadShortCached } from '@/lib/cache/shortResponse';
import { GET as heatmapGET } from '@/app/api/crypto/heatmap/route';
import { GET as categoriesGET } from '@/app/api/crypto/categories/route';
import { GET as goldenEggGET } from '@/app/api/golden-egg/route';

function reset() {
  clearShortResponseCache();
  state.store.clear();
  state.redisUp = true;
  state.session = { workspaceId: 'ws1' };
  state.paid = true;
  state.quotaOn = false;
  state.marketCalls = 0;
  state.marketError = null;
  state.defiCalls = 0;
  state.categoryCalls = 0;
  state.oiCalls = 0;
  state.computeCalls = 0;
  state.asOf = '2026-10-10T12:00:00.000Z';
  state.stale = true;
  state.market = [{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', current_price: 100, price_change_24h: 1, price_change_percentage_24h: 1, total_volume: 10, market_cap: 1000 }];
  state.categories = [{ id: 'layer-1', name: 'Layer 1', market_cap: 1, market_cap_change_24h: 1, volume_24h: 1, top_3_coins: [], updated_at: '2026-10-10T11:00:00.000Z' }];
  state.gate = null;
  state.resolve.mockReset();
  state.reserve.mockReset();
  state.settle.mockReset();
  state.reserve.mockResolvedValue({ status: 'reserved', reservation: { token: 'fixture' }, day: '2026-10-10', resetsAt: '2026-10-11T04:00:00Z', limit: 3, used: 1 });
  state.settle.mockResolvedValue(true);
}

describe('short response cache', () => {
  beforeEach(reset);

  it('a heatmap hit spends zero upstream calls and keeps asOf and stale', async () => {
    const first = await heatmapGET(new NextRequest('https://example.test/api/crypto/heatmap'));
    const body1 = await first.json();
    const second = await heatmapGET(new NextRequest('https://example.test/api/crypto/heatmap'));
    const body2 = await second.json();
    expect(first.status).toBe(200);
    expect(first.headers.get('cache-control')).toBe('private, max-age=45');
    expect(second.headers.get('cache-control')).not.toContain('public');
    expect(state.marketCalls).toBe(1);
    expect(state.defiCalls).toBe(1);
    expect(state.oiCalls).toBe(1);
    expect(body2.timestamp).toBe(body1.timestamp);
    expect(body2.meta).toEqual(body1.meta);
    expect(body2.meta.stale).toBe(true);
    expect(body2.meta.lastUpdated).toBe(body1.timestamp);
  });

  it('does not store an empty heatmap or an unauthorized read', async () => {
    state.market = [];
    expect((await heatmapGET(new NextRequest('https://example.test/api/crypto/heatmap'))).status).toBe(500);
    expect((await heatmapGET(new NextRequest('https://example.test/api/crypto/heatmap'))).status).toBe(500);
    expect(state.marketCalls).toBe(2);
    state.session = null;
    const denied = await heatmapGET(new NextRequest('https://example.test/api/crypto/heatmap'));
    expect(denied.status).toBe(401);
    expect(denied.headers.get('cache-control')).toBe('private, no-store');
    expect(state.marketCalls).toBe(2);
  });

  it('singleflights concurrent heatmap loads and then serves Redis after memory is cleared', async () => {
    let release!: () => void;
    state.gate = new Promise((resolve) => { release = resolve; });
    const pending = Promise.all([
      heatmapGET(new NextRequest('https://example.test/api/crypto/heatmap')),
      heatmapGET(new NextRequest('https://example.test/api/crypto/heatmap')),
    ]);
    await vi.waitFor(() => expect(state.marketCalls).toBe(1));
    release();
    const [a, b] = await pending;
    expect((await a.json()).meta.lastUpdated).toBe((await b.json()).meta.lastUpdated);
    expect(state.marketCalls).toBe(1);
    clearShortResponseCache();
    await heatmapGET(new NextRequest('https://example.test/api/crypto/heatmap'));
    expect(state.marketCalls).toBe(1);
    const stored = JSON.stringify([...state.store.values()]);
    expect(stored).not.toContain('copilotEvidenceToken');
  });

  it('a thrown loader is not cached', async () => {
    state.marketError = new Error('upstream down');
    expect((await heatmapGET(new NextRequest('https://example.test/api/crypto/heatmap'))).status).toBe(500);
    state.marketError = null;
    expect((await heatmapGET(new NextRequest('https://example.test/api/crypto/heatmap'))).status).toBe(200);
    expect(state.marketCalls).toBe(2);
    let calls = 0;
    await expect(loadShortCached('unit:throw', async () => { calls += 1; throw new Error('nope'); })).rejects.toThrow('nope');
    await expect(loadShortCached('unit:throw', async () => { calls += 1; throw new Error('nope'); })).rejects.toThrow('nope');
    expect(calls).toBe(2);
  });

  it('a categories hit spends zero upstream calls and keeps asOf', async () => {
    const first = await categoriesGET();
    const body1 = await first.json();
    const second = await categoriesGET();
    const body2 = await second.json();
    expect(first.headers.get('cache-control')).toBe('private, max-age=45');
    expect(state.categoryCalls).toBe(1);
    expect(body2.timestamp).toBe(body1.timestamp);
    expect(body2.meta.stale).toBe(true);
    expect(body2.meta.lastUpdated).toBe('2026-10-10T11:00:00.000Z');
  });

  it('keeps Free, Pro, and signed-out golden egg packets on separate keys', async () => {
    state.quotaOn = true;
    state.session = { workspaceId: 'ws1' };
    const egg = (symbol = 'AAPL') => goldenEggGET(new NextRequest(`https://example.test/api/golden-egg?symbol=${symbol}`));
    state.resolve.mockResolvedValue({ bypass: false, subject: 'account:ws1', plan: 'pro' });
    state.asOf = 'pro-asof';
    const pro = await (await egg()).json();
    state.resolve.mockResolvedValue({ bypass: false, subject: 'account:ws1', plan: 'free' });
    state.asOf = 'free-asof';
    const free = await (await egg()).json();
    state.session = null;
    state.resolve.mockResolvedValue({ bypass: false, subject: 'visitor:v', plan: 'visitor' });
    state.asOf = 'visitor-asof';
    const visitor = await (await egg()).json();
    expect(state.computeCalls).toBe(3);
    expect(pro.data.asOf).toBe('pro-asof');
    expect(free.data.asOf).toBe('free-asof');
    expect(visitor.data.asOf).toBe('visitor-asof');
    const again = await egg();
    expect(again.headers.get('cache-control')).toBe('private, no-store');
    expect(state.computeCalls).toBe(3);
    expect((await again.json()).data.asOf).toBe('visitor-asof');
    const keys = [...state.store.keys()];
    expect(keys.some((key) => key.includes(':pro:'))).toBe(true);
    expect(keys.some((key) => key.includes(':free:'))).toBe(true);
    expect(keys.some((key) => key.includes(':signed-out:'))).toBe(true);
    expect(JSON.stringify([...state.store.values()])).not.toContain('copilotEvidenceToken');
  });

  it('a signed-out miss does not return a Pro packet, and fresh bypasses the read', async () => {
    state.quotaOn = false;
    state.paid = true;
    state.asOf = 'pro-asof';
    const pro = await goldenEggGET(new NextRequest('https://example.test/api/golden-egg?symbol=AAPL'));
    expect((await pro.json()).data.asOf).toBe('pro-asof');
    state.paid = false;
    const blocked = await goldenEggGET(new NextRequest('https://example.test/api/golden-egg?symbol=AAPL'));
    expect(blocked.status).toBe(403);
    expect(JSON.stringify(await blocked.json())).not.toContain('pro-asof');
    expect(state.computeCalls).toBe(1);
    state.paid = true;
    state.asOf = 'fresh-asof';
    const fresh = await goldenEggGET(new NextRequest('https://example.test/api/golden-egg?symbol=AAPL&fresh=1'));
    expect((await fresh.json()).data.asOf).toBe('fresh-asof');
    expect(state.computeCalls).toBe(2);
    const cached = await goldenEggGET(new NextRequest('https://example.test/api/golden-egg?symbol=AAPL'));
    expect((await cached.json()).data.asOf).toBe('fresh-asof');
    expect(state.computeCalls).toBe(2);
  });

  it('returns a clone so a caller cannot change the stored asOf', async () => {
    const first = await loadShortCached('unit:asof', async () => ({ asOf: 'kept', stale: true }));
    first.value.asOf = 'mutated';
    const second = await loadShortCached('unit:asof', async () => ({ asOf: 'other', stale: false }));
    expect(second.value.asOf).toBe('kept');
    expect(second.hit).toBe('memory');
  });

  it('leaves heatmap and categories off the blanket no-store rule', async () => {
    const rules = await nextConfig.headers!();
    const noStore = rules.filter((rule) => rule.headers.some((header) => header.key === 'Cache-Control' && header.value.includes('no-store')) && rule.source.startsWith('/api'));
    expect(noStore).toHaveLength(1);
    const match = getPathMatch(noStore[0].source, { removeUnnamedParams: true, strict: true });
    expect(match('/api/crypto/heatmap')).toBeFalsy();
    expect(match('/api/crypto/categories')).toBeFalsy();
    expect(match('/api/golden-egg')).toBeTruthy();
    expect(match('/api/share/radar/latest.png')).toBeFalsy();
  });
});
