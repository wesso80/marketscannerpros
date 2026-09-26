import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => ({ workspaceId: 'w1', tier: 'pro' })) }));
vi.mock('@/lib/proTraderAccess', () => ({ hasPaidSessionAccess: () => true }));
vi.mock('@/lib/confluence-learning-agent', () => ({ confluenceLearningAgent: { scanHierarchical: vi.fn(async () => null) } }));
vi.mock('@/lib/coingecko', () => ({ getAggregatedFundingRates: vi.fn(async () => []), getAggregatedOpenInterest: vi.fn(async () => []) }));
vi.mock('@/lib/goldenEggFetchers', () => ({
  detectAssetClass: (s: string) => (s.startsWith('BTC') ? 'crypto' : 'equity'),
  fetchPrice: vi.fn(),
  fetchIndicators: vi.fn(async () => null),
  fetchOptionsSnapshot: vi.fn(async () => null),
  fetchMPE: vi.fn(async () => null),
}));

import { fetchPrice } from '@/lib/goldenEggFetchers';
import { lastCompletedEquitySession } from '@/lib/scanner/dataTrust';
import { GET } from '@/app/api/dve/route';

function priceData(lastCompletedBarAt: string, barInterval = '1d') {
  const closes = Array.from({ length: 300 }, (_, i) => 100 + Math.sin(i / 7) * 3 + i * 0.05);
  return {
    price: closes[closes.length - 1], change: 0, changePct: 0, high: 0, low: 0, volume: 1e6, avgVolume: 1e6,
    historicalCloses: closes, historicalOpens: closes, historicalHighs: closes.map((c) => c + 1), historicalLows: closes.map((c) => c - 1),
    lastCompletedBarAt, barInterval,
  };
}
const call = async (symbol: string) => (await GET(new NextRequest(`https://example.test/api/dve?symbol=${symbol}`))).json();

describe('DVE freshness comes from the data age, not the cache (RS-8)', () => {
  beforeEach(() => vi.mocked(fetchPrice).mockReset());

  it('a cache hit within the TTL keeps the fresh status and the original computation time', async () => {
    vi.mocked(fetchPrice).mockResolvedValue(priceData(lastCompletedEquitySession(Date.now())) as any);
    const first = await call('FRESH1');
    expect(first.cached).toBe(false);
    expect(first.dataFreshness).toBe('fresh');
    const second = await call('FRESH1');
    expect(second.cached).toBe(true);
    expect(second.dataFreshness).toBe('fresh');
    expect(second.computedAt).toBe(first.computedAt);
    expect(fetchPrice).toHaveBeenCalledTimes(1);
  });

  it('old bars are stale even on a fresh calculation', async () => {
    const old = new Date(Date.now() - 12 * 86_400_000).toISOString().slice(0, 10);
    vi.mocked(fetchPrice).mockResolvedValue(priceData(old) as any);
    const body = await call('OLD1');
    expect(body.cached).toBe(false);
    expect(body.dataFreshness).toBe('stale');
    expect(body.dataAsOf).toBe(old);
  });

  it('crypto (24/7) judges the last completed daily bar by the clock; a missing bar time is unknown, never fresh', async () => {
    const yesterday = new Date(Date.now() - 86_400_000); yesterday.setUTCHours(0, 0, 0, 0);
    vi.mocked(fetchPrice).mockResolvedValue(priceData(yesterday.toISOString()) as any);
    expect((await call('BTCUSD')).dataFreshness).toBe('fresh');
    vi.mocked(fetchPrice).mockResolvedValue(priceData(undefined as any) as any);
    expect((await call('NOBARTIME')).dataFreshness).toBe('unknown');
  });
});

describe('RS-18: ?symbol= runs the DVE analysis', () => {
  it('the page calls analyze for the requested symbol, not just setSymbol', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(require('node:path').resolve(__dirname, '../src/features/volatilityEngine/VolatilityEnginePage.tsx'), 'utf8');
    const effect = src.slice(src.indexOf('const analyzeRef = useRef(analyze)'), src.indexOf('}, [requestedSymbol]);'));
    expect(effect).toContain('if (requestedSymbol) void analyzeRef.current(requestedSymbol);');
    expect(src).not.toContain('useEffect(() => { setSymbol(requestedSymbol); setReading(null); }, [requestedSymbol]);');
  });
});
