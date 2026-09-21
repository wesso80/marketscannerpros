import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn() }));
vi.mock('@/lib/coingecko', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/coingecko')>(), getCryptoNews: vi.fn(), getPublicTreasury: vi.fn(),
}));
import { getSessionFromCookie } from '@/lib/auth';
import { getCryptoNews, getPublicTreasury } from '@/lib/coingecko';
import { GET as news } from '@/app/api/crypto/cg-news/route';
import { GET as treasury } from '@/app/api/crypto/public-treasury/route';
import { treasuryValueVsCost, formatTreasuryUsd } from '@/lib/crypto/treasuryValuation';
import { buildMechanicalZones } from '@/lib/goldenEgg/mechanicalZones';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSessionFromCookie).mockResolvedValue({ workspaceId: 'workspace-a', tier: 'pro' } as any);
  vi.mocked(getCryptoNews).mockResolvedValue([]);
});
describe('CoinGecko news request contract', () => {
  it('rejects guides without a coin before spending a provider call', async () => {
    const response = await news(new NextRequest('https://example.test/api/crypto/cg-news?type=guides'));
    expect(response.status).toBe(400);
    expect(getCryptoNews).not.toHaveBeenCalled();
  });
  it('requests coin-specific guides and uses the real publication timestamp', async () => {
    const posted = new Date(Date.now() - 60_000).toISOString();
    vi.mocked(getCryptoNews).mockResolvedValue([{ title: 'Guide', url: 'https://example.test/guide', image: '', author: '', posted_at: posted, type: 'guide', source_name: 'CoinGecko', related_coin_ids: ['bitcoin'] }]);
    const body = await (await news(new NextRequest('https://example.test/api/crypto/cg-news?type=guides&coin_id=bitcoin'))).json();
    expect(getCryptoNews).toHaveBeenCalledWith(expect.objectContaining({ coin_id: 'bitcoin', type: 'guides', per_page: 20 }));
    expect(body.timestamp).toBe(posted);
    expect(body.articles[0].type).toBe('guide');
  });
  it.each(['page=-2&per_page=900', 'page=bad&per_page=bad', 'page=30&per_page=0'])('keeps pagination within provider bounds: %s', async query => {
    await news(new NextRequest(`https://example.test/api/crypto/cg-news?${query}`));
    const options = vi.mocked(getCryptoNews).mock.calls[0][0]!;
    expect(options.page).toBeGreaterThanOrEqual(1);
    expect(options.page).toBeLessThanOrEqual(20);
    expect(options.per_page).toBeGreaterThanOrEqual(1);
    expect(options.per_page).toBeLessThanOrEqual(20);
  });
  it('rejects unsupported types and unauthenticated requests', async () => {
    expect((await news(new NextRequest('https://example.test/api/crypto/cg-news?type=invalid'))).status).toBe(400);
    vi.mocked(getSessionFromCookie).mockResolvedValue(null);
    expect((await news(new NextRequest('https://example.test/api/crypto/cg-news'))).status).toBe(401);
    expect(getCryptoNews).not.toHaveBeenCalled();
  });
});

describe('treasury evidence', () => {
  it('does not stamp fetch time as a fresh valuation observation', async () => {
    vi.mocked(getPublicTreasury).mockResolvedValue({ total_holdings: 0, total_value_usd: 0, market_cap_dominance: 0, companies: [] } as any);
    const body = await (await treasury(new NextRequest('https://example.test/api/crypto/public-treasury?coin=bitcoin'))).json();
    expect(body.freshnessStatus).toBe('unknown');
    expect(body.timestamp).toBeNull();
    expect(Number.isFinite(Date.parse(body.retrievedAt))).toBe(true);
  });
  it('does not label a sold holding as a total loss without proceeds data', () => {
    expect(treasuryValueVsCost(0, 186876608, 0)).toMatchObject({ profitLossUsd: null, profitLossPercent: null, unavailableReason: expect.stringContaining('sales proceeds unavailable') });
  });
  it('computes value versus cost only for a currently reported holding with known values', () => {
    expect(treasuryValueVsCost(2, 200, 250)).toMatchObject({ profitLossUsd: 50, profitLossPercent: 25 });
    expect(treasuryValueVsCost(2, 200, 150)).toMatchObject({ profitLossUsd: -50, profitLossPercent: -25 });
    expect(treasuryValueVsCost(2, 0, 150).profitLossUsd).toBeNull();
    expect(treasuryValueVsCost(2, 100, Number.NaN).profitLossUsd).toBeNull();
  });
  it('formats negative amounts with the same units as positive amounts', () => {
    expect(formatTreasuryUsd(-95594288)).toBe('−$95.6M');
    expect(formatTreasuryUsd(95594288)).toBe('$95.6M');
    expect(formatTreasuryUsd(0)).toBe('$0');
  });
});

describe('Golden Egg mechanical target arithmetic', () => {
  it.each([true, false])('uses the actual reference-to-invalidation distance for %s long direction', isLong => {
    const reference = isLong ? 101 : 99;
    const stop = isLong ? 95 : 105;
    const zones = buildMechanicalZones(reference, stop, 100, isLong);
    expect(zones).toHaveLength(3);
    for (const [i, multiple] of [1, 1.5, 2.5].entries()) {
      expect(Math.abs(zones[i].price - reference) / Math.abs(reference - stop)).toBe(multiple);
      expect(zones[i].label).toBe(`${multiple.toFixed(1)}× reference-to-invalidation risk`);
    }
  });
  it('labels the achieved multiple after capping instead of claiming the requested multiple', () => {
    const reference = 0.2241, stop = 0.1857, spot = 0.2177;
    const zone = buildMechanicalZones(reference, stop, spot, true).at(-1)!;
    expect(zone.price).toBeCloseTo(spot * 1.3, 10);
    expect(zone.label).toBe('1.5× reference-to-invalidation risk (30% price cap)');
    expect(zone.label).not.toContain('2.5×');
  });
  it('withholds invalid or wrong-side targets', () => {
    expect(buildMechanicalZones(100, 100, 100, true)).toEqual([]);
    expect(buildMechanicalZones(100, 110, 100, true)).toEqual([]);
    expect(buildMechanicalZones(140, 130, 100, true)).toEqual([]);
    expect(buildMechanicalZones(Number.NaN, 90, 100, true)).toEqual([]);
  });
});
