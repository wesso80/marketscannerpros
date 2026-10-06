import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  FIXED_BASKET_CHANGE_LABEL,
  headlineOpenInterest,
  selectBtcOpenInterestTile,
  sumOpenInterestTotals,
  type OpenInterestTotal,
} from '@/lib/crypto/openInterestTotal';

const coingecko = vi.hoisted(() => ({
  getDerivativesTickers: vi.fn(),
  getMarketData: vi.fn(),
  getAggregatedFundingRates: vi.fn(),
  getCoinDetailFull: vi.fn(),
  getOHLC: vi.fn(),
  getMarketChartFull: vi.fn(),
  searchCoins: vi.fn(),
}));
const basket = vi.hoisted(() => ({ getOiEvidence: vi.fn() }));

vi.mock('@/lib/coingecko', () => ({
  getDerivativesTickers: coingecko.getDerivativesTickers,
  getMarketData: coingecko.getMarketData,
  getAggregatedFundingRates: coingecko.getAggregatedFundingRates,
  getCoinDetailFull: coingecko.getCoinDetailFull,
  getOHLC: coingecko.getOHLC,
  getMarketChartFull: coingecko.getMarketChartFull,
  searchCoins: coingecko.searchCoins,
  COINGECKO_ID_MAP: { BTC: 'bitcoin', ETH: 'ethereum' },
  buildCoinGeckoResponseMeta: () => ({
    provider: 'coingecko',
    sourceAttribution: 'CoinGecko API',
    planMode: 'pro',
    endpointFamily: 'DERIVATIVES',
    lastUpdated: '2026-10-06T00:00:00.000Z',
    freshnessStatus: 'fresh',
    stale: false,
    fallbackUsed: false,
    simulationUsed: false,
  }),
}));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => ({ workspaceId: 'w', tier: 'pro', cid: 'c' })) }));
vi.mock('@/lib/crypto/oiHistory', () => ({ getOiEvidence: basket.getOiEvidence }));
vi.mock('@/lib/redis', () => ({ getCached: vi.fn(async () => null), setCached: vi.fn(async () => false), getRedis: () => null }));

const BTC_TOTAL = 14_350_000_000;
const tradedAt = () => Date.now() / 1000 - 30;

function tickers() {
  const at = tradedAt();
  return [
    { market: 'Binance', symbol: 'BTCUSDT', index_id: 'BTC', contract_type: 'perpetual', open_interest: 10_000_000_000, last_traded_at: at, price: '100000', volume_24h: 1 },
    { market: 'OKX', symbol: 'BTC-USDT-SWAP', index_id: 'BTC', contract_type: 'perpetual', open_interest: 4_000_000_000, last_traded_at: at, price: '100000', volume_24h: 1 },
    { market: 'Bybit', symbol: 'BTCUSDT', index_id: 'BTC', contract_type: 'perpetual', open_interest: 350_000_000, last_traded_at: at, price: '100000', volume_24h: 1 },
    { market: 'Binance', symbol: 'BTCUSDT', index_id: 'BTC', contract_type: 'perpetual', open_interest: 1, last_traded_at: at - 10, price: '100000', volume_24h: 1 },
    { market: 'Binance', symbol: 'BTC-DEC', index_id: 'BTC', contract_type: 'futures', open_interest: 9_000_000_000, last_traded_at: at, price: '100000', volume_24h: 1 },
    { market: 'Ghost', symbol: 'BTCUSDT', index_id: 'BTC', contract_type: 'perpetual', open_interest: 0, last_traded_at: at, price: '100000', volume_24h: 1 },
    { market: 'Stale', symbol: 'BTCUSDT', index_id: 'BTC', contract_type: 'perpetual', open_interest: 8_000_000_000, last_traded_at: at - 1_000, price: '100000', volume_24h: 1 },
    { market: 'Binance', symbol: 'ETHUSDT', index_id: 'ETH', contract_type: 'perpetual', open_interest: 2_000_000_000, last_traded_at: at, price: '3000', volume_24h: 1 },
  ];
}

describe('shared open-interest total', () => {
  it('sums every fresh perpetual venue and labels the source', () => {
    const now = Date.now();
    const [btc, eth] = sumOpenInterestTotals(tickers(), ['BTC', 'ETH'], now);
    expect(btc).toMatchObject({
      symbol: 'BTC',
      totalUsd: BTC_TOTAL,
      exchanges: 3,
      sourceLabel: 'CoinGecko derivatives · top 3 exchanges',
    });
    expect(btc.observedAt).toEqual(expect.any(String));
    expect(eth).toMatchObject({ symbol: 'ETH', totalUsd: 2_000_000_000, exchanges: 1, sourceLabel: 'CoinGecko derivatives · top 1 exchange' });
    const headline = headlineOpenInterest([btc, eth]);
    expect(headline.totalUsd).toBe(BTC_TOTAL + 2_000_000_000);
    expect(headline.exchanges).toBe(3);
    expect(headline.sourceLabel).toBe('CoinGecko derivatives · top 3 exchanges per coin');
  });

  it('returns null, not 0, when the feed fails or a coin has no usable quote', () => {
    const missing = sumOpenInterestTotals(null, ['BTC'])[0];
    expect(missing.totalUsd).toBeNull();
    expect(missing.totalUsd).not.toBe(0);
    expect(missing.sourceLabel).toBe('CoinGecko derivatives');
    expect(sumOpenInterestTotals([], ['BTC'])[0].totalUsd).toBeNull();
    expect(sumOpenInterestTotals([
      { market: 'Binance', symbol: 'BTCUSDT', index_id: 'BTC', contract_type: 'perpetual', open_interest: Number.NaN, last_traded_at: tradedAt() },
      { market: 'OKX', symbol: 'BTCUSDT', index_id: 'BTC', contract_type: 'perpetual', open_interest: -5, last_traded_at: tradedAt() },
    ], ['BTC'])[0].totalUsd).toBeNull();
    const blank: OpenInterestTotal = { symbol: 'SOL', totalUsd: null, exchanges: 0, observedAt: null, sourceLabel: 'CoinGecko derivatives' };
    const present: OpenInterestTotal = { symbol: 'BTC', totalUsd: 5, exchanges: 1, observedAt: '2026-10-06T00:00:00.000Z', sourceLabel: 'CoinGecko derivatives · top 1 exchange' };
    expect(headlineOpenInterest(null).totalUsd).toBeNull();
    expect(headlineOpenInterest([blank, present]).totalUsd).toBe(5);
  });
});

describe('three routes share one BTC total', () => {
  beforeEach(() => {
    coingecko.getDerivativesTickers.mockResolvedValue(tickers());
    coingecko.getMarketData.mockResolvedValue([{ symbol: 'btc', name: 'Bitcoin', current_price: 100000, price_change_percentage_24h: 1.2 }]);
    coingecko.getAggregatedFundingRates.mockResolvedValue([]);
    coingecko.getCoinDetailFull.mockResolvedValue({
      id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', market_data: { last_updated: '2026-10-06T00:00:00.000Z' },
    });
    coingecko.getOHLC.mockResolvedValue([]);
    coingecko.getMarketChartFull.mockResolvedValue(null);
    basket.getOiEvidence.mockResolvedValue({
      coins: [{ symbol: 'BTC', value: 100, change24h: 2.5, exchanges: 1, observedAt: Date.now(), comparisonAt: null }],
      totalOpenInterest: 100,
      change24h: 2.5,
      comparisonReason: null,
      coverage: 'Fixed contracts selected from the initial snapshot. Not the whole market.',
      baselineReadyAt: null,
      observedAt: new Date().toISOString(),
      method: 'coingecko-major-perpetual-usd-v3',
    });
  });

  it('detail, open interest and crypto derivatives return the same BTC total and source label', async () => {
    const { GET: detail } = await import('@/app/api/crypto/detail/route');
    const { GET: openInterest } = await import('@/app/api/crypto/open-interest/route');
    const { GET: derivatives } = await import('@/app/api/crypto-derivatives/route');
    const detailBody = await (await detail(new NextRequest('http://localhost/api/crypto/detail?action=detail&symbol=BTC'))).json();
    const oiBody = await (await openInterest(new NextRequest('http://localhost/api/crypto/open-interest'))).json();
    const derivBody = await (await derivatives(new NextRequest('http://localhost/api/crypto-derivatives?symbol=BTC'))).json();
    const btc = oiBody.coins.find((coin: { symbol: string }) => coin.symbol === 'BTC');
    expect(detailBody.derivatives.open_interest).toBe(BTC_TOTAL);
    expect(detailBody.derivatives.open_interest_source).toBe('CoinGecko derivatives · top 3 exchanges');
    expect(btc.openInterest).toBe(BTC_TOTAL);
    expect(btc.sourceLabel).toBe('CoinGecko derivatives · top 3 exchanges');
    expect(oiBody.summary.totalOpenInterest).toBe(BTC_TOTAL);
    expect(oiBody.summary.totalOpenInterest).not.toBe(100);
    expect(oiBody.summary.change24h).toBe(2.5);
    expect(oiBody.summary.change24hLabel).toBe(FIXED_BASKET_CHANGE_LABEL);
    expect(derivBody.aggregatedOI.totalOI).toBe(BTC_TOTAL);
    expect(derivBody.aggregatedOI.sourceLabel).toBe('CoinGecko derivatives · top 3 exchanges');
    expect(derivBody.aggregatedOI.totalOI).toBe(detailBody.derivatives.open_interest);
    expect(derivBody.aggregatedOI.totalOI).toBe(btc.openInterest);
  });

  it('a failed derivatives read does not fall back to the basket or to 0', async () => {
    coingecko.getDerivativesTickers.mockResolvedValue(null);
    const { getOpenInterestTotals } = await import('@/lib/crypto/openInterestTotal');
    const { GET: openInterest } = await import('@/app/api/crypto/open-interest/route');
    const { GET: detail } = await import('@/app/api/crypto/detail/route');
    expect(await getOpenInterestTotals(['BTC', 'ETH'])).toBeNull();
    const oiBody = await (await openInterest(new NextRequest('http://localhost/api/crypto/open-interest'))).json();
    expect(oiBody.summary.totalOpenInterest).toBeNull();
    expect(oiBody.summary.totalOpenInterestFormatted).toBeNull();
    expect(oiBody.coins[0].openInterest).toBeNull();
    expect(oiBody.summary.change24h).toBe(2.5);
    const detailBody = await (await detail(new NextRequest('http://localhost/api/crypto/detail?action=detail&symbol=BTC'))).json();
    expect(detailBody.derivatives?.open_interest ?? null).toBeNull();
    expect(JSON.stringify(detailBody)).not.toContain('"open_interest":0');
  });

  it('the BTC dashboard tile matches detail and crypto-derivatives when other coins are present', async () => {
    basket.getOiEvidence.mockResolvedValue({
      coins: [
        { symbol: 'BTC', value: 100, change24h: 2.5, exchanges: 1, observedAt: Date.now(), comparisonAt: null },
        { symbol: 'ETH', value: 40, change24h: -1, exchanges: 1, observedAt: Date.now(), comparisonAt: null },
      ],
      totalOpenInterest: 140,
      change24h: 2.5,
      comparisonReason: null,
      coverage: 'Fixed contracts selected from the initial snapshot. Not the whole market.',
      baselineReadyAt: null,
      observedAt: new Date().toISOString(),
      method: 'coingecko-major-perpetual-usd-v3',
    });
    const { GET: detail } = await import('@/app/api/crypto/detail/route');
    const { GET: openInterest } = await import('@/app/api/crypto/open-interest/route');
    const { GET: derivatives } = await import('@/app/api/crypto-derivatives/route');
    const detailBody = await (await detail(new NextRequest('http://localhost/api/crypto/detail?action=detail&symbol=BTC'))).json();
    const oiBody = await (await openInterest(new NextRequest('http://localhost/api/crypto/open-interest'))).json();
    const derivBody = await (await derivatives(new NextRequest('http://localhost/api/crypto-derivatives?symbol=BTC'))).json();
    const tile = selectBtcOpenInterestTile(oiBody);
    expect(oiBody.summary.totalOpenInterest).toBe(BTC_TOTAL + 2_000_000_000);
    expect(tile.usd).toBe(BTC_TOTAL);
    expect(tile.usd).not.toBe(oiBody.summary.totalOpenInterest);
    expect(tile.value).toBe('$14.35B');
    expect(tile.sourceLabel).toBe('CoinGecko derivatives · top 3 exchanges');
    expect(tile.shownCoinCount).toBe(2);
    expect(tile.shownSumFormatted).toBe('$16.35B');
    expect(tile.shownSourceLabel).toBe('CoinGecko derivatives · top 3 exchanges per coin');
    expect(tile.usd).toBe(detailBody.derivatives.open_interest);
    expect(tile.usd).toBe(derivBody.aggregatedOI.totalOI);
    expect(tile.sourceLabel).toBe(detailBody.derivatives.open_interest_source);
    expect(tile.sourceLabel).toBe(derivBody.aggregatedOI.sourceLabel);
  });
});
