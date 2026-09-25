import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { parseOkxFundingRates, parseOkxLongShortRatio } from '@/lib/crypto/okxDerivatives';
import { cryptoReviewCoverage, cryptoReviewMissing, cryptoSpotContext } from '@/lib/cryptoReviewData';

const HOUR = 3_600_000;
const now = Date.now();
const fundingRow = (instId: string, fundingRate: string, intervalHours = 8, overrides: Record<string, unknown> = {}) => {
  const fundingTime = Math.ceil(now / HOUR) * HOUR + HOUR;
  return {
    instId, instType: 'SWAP', fundingRate,
    fundingTime: String(fundingTime),
    prevFundingTime: String(fundingTime - intervalHours * HOUR),
    nextFundingTime: String(fundingTime + intervalHours * HOUR),
    ts: String(now - 1_000),
    ...overrides,
  };
};

describe('OKX funding parser (OV-2)', () => {
  it('uses each contract\'s observed interval and normalises to 8h', () => {
    const rows = [fundingRow('BTC-USDT-SWAP', '0.0001', 8), fundingRow('ETH-USDT-SWAP', '0.0001', 4), fundingRow('BTC-USD-SWAP', '0.5', 8)];
    const [btc, eth] = parseOkxFundingRates(rows, ['BTC', 'ETH']);
    expect(btc).toMatchObject({ symbol: 'BTC', intervalHours: 8 });
    expect(btc.rawRatePercent).toBeCloseTo(0.01);
    expect(btc.ratePercent8h).toBeCloseTo(0.01);
    expect(btc.annualizedPercent).toBeCloseTo(0.01 * 3 * 365);
    expect(eth).toMatchObject({ symbol: 'ETH', intervalHours: 4 });
    expect(eth.ratePercent8h).toBeCloseTo(0.02);
    expect(eth.annualizedPercent).toBeCloseTo(0.01 * 6 * 365);
  });

  it('falls back to nextFundingTime for the interval and withholds rows without a schedule', () => {
    const noPrev = fundingRow('SOL-USDT-SWAP', '0.0002', 8, { prevFundingTime: '' });
    const noSchedule = fundingRow('XRP-USDT-SWAP', '0.0002', 8, { prevFundingTime: '', nextFundingTime: '' });
    const noRate = fundingRow('DOGE-USDT-SWAP', '', 8);
    const parsed = parseOkxFundingRates([noPrev, noSchedule, noRate], ['SOL', 'XRP', 'DOGE']);
    expect(parsed.map((p) => p.symbol)).toEqual(['SOL']);
    expect(parsed[0].intervalHours).toBe(8);
  });

  it('parses the latest long/short account ratio into account shares', () => {
    expect(parseOkxLongShortRatio('btc', [['1000', '3'], ['2000', '1.5']])).toEqual({ symbol: 'BTC', longShortRatio: 1.5, longAccount: 60, shortAccount: 40, timestamp: 2000 });
    expect(parseOkxLongShortRatio('BTC', [])).toBeNull();
    expect(parseOkxLongShortRatio('BTC', [['1000', '0']])).toBeNull();
  });
});

describe('GET /api/funding-rates (OV-2)', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.resetModules(); });

  it('returns observed OKX funding with fresh metadata instead of a permanent 503', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      code: '0', msg: '', data: [fundingRow('BTC-USDT-SWAP', '0.0001', 8), fundingRow('ETH-USDT-SWAP', '-0.0002', 4)],
    }), { status: 200 }));
    const { GET } = await import('@/app/api/funding-rates/route');
    const response = await GET(new NextRequest('http://localhost/api/funding-rates'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ available: true, source: 'okx', freshnessStatus: 'fresh', meta: { provider: 'okx', freshnessStatus: 'fresh' } });
    expect(body.coins.map((c: any) => [c.symbol, c.fundingRatePercent, c.fundingIntervalHours])).toEqual([['BTC', 0.01, 8], ['ETH', -0.04, 4]]);
    expect(body.average.fundingRatePercent).toBeCloseTo(-0.015);
    expect(body.nextFunding.timestamp).not.toBeNull();
    expect(body.nextFunding.timeUntilMs).toBeGreaterThan(0);
  });

  it('reports a clear 503 when OKX cannot be reached and nothing is cached', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('blocked', { status: 451 }));
    const { GET } = await import('@/app/api/funding-rates/route');
    const response = await GET(new NextRequest('http://localhost/api/funding-rates'));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ available: false, coins: [] });
  });
});

describe('Crypto Command partial review (OV-2)', () => {
  const fresh = { freshnessStatus: 'fresh' };
  const spotOnly = {
    market: { marketCapChange24h: -2.7, totalVolume: 100, totalMarketCap: 1000, dominance: [{ symbol: 'BTC', dominance: 58.3 }] },
    marketMeta: fresh,
    trending: { coins: [{ change24h: 1 }, { change24h: -1 }, { change24h: -2 }, { change24h: -3 }], categories: [] },
    trendingMeta: fresh,
    funding: null, fundingMeta: undefined, oi: null, oiMeta: undefined,
  };

  it('computes breadth, leadership and volatility from spot data when funding and OI are down', () => {
    expect(cryptoReviewCoverage(spotOnly)).toEqual({ market: true, breadth: true, funding: false, oi: false });
    expect(cryptoReviewMissing(spotOnly)).toEqual(['Funding unavailable', 'Comparable open-interest change unavailable']);
    expect(cryptoSpotContext(spotOnly)).toMatchObject({ breadthScore: 25, breadthLabel: 'Weak', leadership: 'Defensive Rotation', volatility: 'Expansion' });
  });

  it('keeps each part unavailable when its own input is missing or stale', () => {
    const noTrending = { ...spotOnly, trending: null, trendingMeta: undefined };
    expect(cryptoSpotContext(noTrending)).toMatchObject({ breadthScore: null, breadthLabel: 'Unavailable', leadership: 'Unavailable', volatility: 'Expansion' });
    const staleMarket = { ...spotOnly, marketMeta: { freshnessStatus: 'stale' } };
    expect(cryptoSpotContext(staleMarket)).toMatchObject({ breadthLabel: 'Weak', leadership: 'Unavailable', volatility: 'Unavailable' });
    expect(cryptoSpotContext(null)).toMatchObject({ breadthScore: null, leadership: 'Unavailable', volatility: 'Unavailable' });
  });

  it('the Crypto Command page and decision card use spot context instead of blanking everything', async () => {
    const { readFileSync } = await import('fs');
    for (const file of ['app/tools/crypto/page.tsx', 'components/CryptoMorningDecisionCard.tsx']) {
      const src = readFileSync(file, 'utf8');
      expect(src).toContain('const spot = cryptoSpotContext(marketData);');
      expect(src).toContain('leadership: spot.leadership');
      expect(src).toContain("liquidity: 'Unavailable', volatility: spot.volatility, breadthScore: spot.breadthScore");
    }
  });
});
