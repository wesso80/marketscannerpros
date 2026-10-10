import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { csvCellForAsset, searchWidgetCoin } from '@/lib/coingeckoSearchCoin';

const cg = vi.hoisted(() => ({
  getCoinDetailFull: vi.fn(),
  getOHLC: vi.fn(),
  getOHLCWithVolume: vi.fn(),
  searchCoins: vi.fn(),
  getAggregatedFundingRates: vi.fn(),
  getTopGainersLosers: vi.fn(),
  getMarketData: vi.fn(),
  getGlobalData: vi.fn(),
  getGlobalMarketCapChart: vi.fn(),
  getPoolWithVolumeBreakdown: vi.fn(),
  getDerivativesForSymbols: vi.fn(),
}));
const session = vi.hoisted(() => ({ current: null as null | { workspaceId: string; tier: string; cid: string } }));

vi.mock('@/lib/auth', () => ({ getSessionFromCookie: async () => session.current }));
vi.mock('@/lib/adminAuth', () => ({
  verifyCronAuth: (req: Request) => req.headers.get('x-cron-secret') === 'cron-ok',
  requireAdmin: async () => ({ ok: false }),
}));
vi.mock('@/lib/db', () => ({ q: async () => [] }));
vi.mock('@/lib/avRateGovernor', () => ({ avTakeToken: async () => undefined }));
vi.mock('@/lib/redis', () => ({ getRedis: () => null, getCachedMulti: async () => [], getCached: async () => null, setCached: async () => false }));
vi.mock('@/lib/crypto/openInterestTotal.server', () => ({ getOpenInterestTotals: async () => [] }));
vi.mock('@/lib/crypto/oiHistory', () => ({
  getOiEvidence: async () => ({
    coins: [],
    totalOpenInterest: null,
    change24h: null,
    carriedContracts: 0,
    expectedContracts: 0,
    comparisonReason: null,
    coverage: 'none',
    method: 'test',
    observedAt: '2026-01-01T00:00:00.000Z',
  }),
}));
vi.mock('@/lib/coingecko', () => ({
  getCoinDetailFull: cg.getCoinDetailFull,
  getOHLC: cg.getOHLC,
  getOHLCWithVolume: cg.getOHLCWithVolume,
  searchCoins: cg.searchCoins,
  getAggregatedFundingRates: cg.getAggregatedFundingRates,
  getTopGainersLosers: cg.getTopGainersLosers,
  getMarketData: cg.getMarketData,
  getGlobalData: cg.getGlobalData,
  getGlobalMarketCapChart: cg.getGlobalMarketCapChart,
  getPoolWithVolumeBreakdown: cg.getPoolWithVolumeBreakdown,
  getDerivativesForSymbols: cg.getDerivativesForSymbols,
  COINGECKO_ID_MAP: { BTC: 'bitcoin' },
  symbolToId: (s: string) => s.toLowerCase(),
  resolveSymbolToId: (s: string) => s.toLowerCase(),
  buildCoinGeckoResponseMeta: () => ({ provider: 'coingecko', lastUpdated: '2026-01-01T00:00:00.000Z', freshnessStatus: 'fresh' }),
}));

const SURFACES = [
  'components/Footer.tsx',
  'components/MarketOverviewWidget.tsx',
  'components/CryptoHeatmap.tsx',
  'components/TrendingCoinsWidget.tsx',
  'components/TopMoversWidget.tsx',
  'components/CategoryHeatmapWidget.tsx',
  'components/DefiStatsWidget.tsx',
  'components/NewListingsWidget.tsx',
  'components/NewPoolsWidget.tsx',
  'components/TrendingPoolsWidget.tsx',
  'components/CryptoSearchWidget.tsx',
  'components/crypto/CryptoBreakdown.tsx',
  'components/markets/MoversView.tsx',
  'components/overview/TodayStrip.tsx',
  'components/terminal/TerminalCryptoDesk.tsx',
  'components/crypto-terminal/CryptoTerminalView.tsx',
  'components/WatchlistWidget.tsx',
  'components/MarketPulseHero.tsx',
  'components/FearGreedGauge.tsx',
  'components/FearGreedHistory.tsx',
  'components/CustomFearGreedGauge.tsx',
  'components/SentimentWidget.tsx',
  'components/OpenInterestWidget.tsx',
  'components/DominanceWidget.tsx',
  'components/NetBuySellWidget.tsx',
  'components/derivatives/DerivativesMarketStrip.tsx',
  'components/admin/CryptoMarketData.tsx',
  'components/admin/CryptoReviewChart.tsx',
  'components/admin/CryptoMarketContext.tsx',
  'components/admin/CryptoNewListings.tsx',
  'app/tools/golden-egg/page.tsx',
  'app/tools/scanner/page.tsx',
  'app/tools/explorer/page.tsx',
  'app/tools/command-center/page.tsx',
  'app/tools/portfolio/page.tsx',
  'app/tools/workspace/PortfolioV2.tsx',
  'app/tools/intraday-charts/page.tsx',
  'app/tools/liquidity-sweep/page.tsx',
  'components/time/TimeScannerPage.tsx',
  'app/daily-pick/DailyPickView.tsx',
  'app/admin/crypto-markets/page.tsx',
  'app/tools/crypto/page.tsx',
  'app/tools/crypto-explorer/page.tsx',
  'app/tools/crypto-dashboard/page.tsx',
  'components/CryptoNewsWidget.tsx',
  'components/PublicTreasuryWidget.tsx',
  'app/api/alerts/check/route.ts',
  'lib/alerts/emailPolicy.ts',
  'lib/jarvis/report/renderEmailHtml.ts',
];

describe('CoinGecko attribution sits on each data view', () => {
  it.each(SURFACES)('%s includes the attribution', (file) => {
    const src = readFileSync(resolve(process.cwd(), file), 'utf8');
    expect(src).toMatch(/CoinGeckoAttribution|CoinGeckoCredit|coinGeckoAttributionHtml/);
  });

  it('terms and privacy name the CoinGecko API as CoinGecko property and exclude its liability', () => {
    const clause = 'Some cryptocurrency data is provided by the CoinGecko API, which is the property of CoinGecko. CoinGecko is not responsible for this service, and to the extent permitted by law we exclude all liability of CoinGecko in connection with your use of it.';
    expect(readFileSync(resolve(process.cwd(), 'app/terms/page.tsx'), 'utf8')).toContain(clause);
    expect(readFileSync(resolve(process.cwd(), 'app/privacy/page.tsx'), 'utf8')).toContain(clause);
  });
});

describe('search widget payload and downloads', () => {
  it('keeps only the fields the search card renders', () => {
    const coin = searchWidgetCoin({
      id: 'bitcoin',
      symbol: 'btc',
      name: 'Bitcoin',
      market_cap_rank: 1,
      image: { small: 'https://img' },
      description: { en: 'secret' },
      links: { homepage: ['https://bitcoin.org'] },
      tickers: [{ market: { name: 'Binance' } }],
      developer_data: { stars: 1 },
      market_data: { current_price: { usd: 1 }, price_change_percentage_24h: 2 },
    } as never);
    expect(coin).toMatchObject({ id: 'bitcoin', symbol: 'btc', market_data: { current_price: { usd: 1 } } });
    expect(JSON.stringify(coin)).not.toMatch(/secret|bitcoin.org|Binance|stars|ohlc|chart/);
  });

  it('blanks crypto price cells in a download and keeps equity cells', () => {
    expect(csvCellForAsset('crypto', '100', true)).toBe('');
    expect(csvCellForAsset('equity', '100', true)).toBe('100');
    expect(csvCellForAsset('crypto', '100', false)).toBe('100');
  });
});

describe('anonymous callers do not receive CoinGecko payloads', () => {
  beforeEach(() => {
    session.current = null;
    process.env.ALPHA_VANTAGE_API_KEY = 'test';
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        last_updated: '2026-09-25 16:15:59 US/Eastern',
        top_gainers: [{ ticker: 'AAPL', price: '150', change_amount: '1', change_percentage: '2%', volume: '1000000' }],
        top_losers: [],
        most_actively_traded: [],
      }),
    })));
  });

  it('detail lookup without a session is 401 and does not read the coin', async () => {
    const { GET } = await import('@/app/api/crypto/detail/route');
    const res = await GET(new NextRequest('https://test/api/crypto/detail?id=bitcoin'));
    expect(res.status).toBe(401);
    expect(cg.getCoinDetailFull).not.toHaveBeenCalled();
  });

  it('a signed-in detail lookup returns the card fields only', async () => {
    session.current = { workspaceId: 'ws', tier: 'pro', cid: 'c' };
    cg.getCoinDetailFull.mockResolvedValue({
      id: 'bitcoin',
      symbol: 'btc',
      name: 'Bitcoin',
      description: { en: 'A long description that the card does not show.' },
      tickers: [{ market: { name: 'Binance' }, last: 1 }],
      market_cap_rank: 1,
      image: { small: 'https://img' },
      market_data: { current_price: { usd: 10 }, price_change_percentage_24h: 1, last_updated: '2026-01-01T00:00:00.000Z' },
    });
    const { GET } = await import('@/app/api/crypto/detail/route');
    const body = await (await GET(new NextRequest('https://test/api/crypto/detail?id=bitcoin'))).json();
    expect(body.id).toBe('bitcoin');
    expect(body.market_data.current_price.usd).toBe(10);
    expect(body.description).toBeUndefined();
    expect(body.tickers).toBeUndefined();
    expect(body.chart).toBeUndefined();
  });

  it('market movers skips CoinGecko for a signed-out caller and still returns equities', async () => {
    cg.getTopGainersLosers.mockResolvedValue({ top_gainers: [{ symbol: 'sol', usd: 150, usd_24h_change: 5, usd_24h_vol: 1e9, usd_market_cap: 7e10 }], top_losers: [] });
    cg.getMarketData.mockResolvedValue([{ symbol: 'btc', current_price: 1, total_volume: 1, market_cap: 1, price_change_percentage_24h: 1 }]);
    const { GET } = await import('@/app/api/market-movers/route');
    const body = await (await GET(new NextRequest('https://test/api/market-movers'))).json();
    expect(cg.getTopGainersLosers).not.toHaveBeenCalled();
    expect(cg.getMarketData).not.toHaveBeenCalled();
    const rows = [...(body.topGainers ?? []), ...(body.topLosers ?? []), ...(body.mostActive ?? [])];
    expect(rows.some((row: { asset_class?: string }) => row.asset_class === 'crypto')).toBe(false);
    expect(rows.some((row: { asset_class?: string }) => row.asset_class === 'equity')).toBe(true);
  });

  it('fear and greed, open interest, custom fear and greed, and pool pressure are 401 without a session', async () => {
    const fear = await import('@/app/api/fear-greed/route');
    const custom = await import('@/app/api/fear-greed-custom/route');
    const oi = await import('@/app/api/open-interest/route');
    const pool = await import('@/app/api/crypto/pool-pressure/route');
    expect((await fear.GET(new NextRequest('https://test/api/fear-greed'))).status).toBe(401);
    expect((await custom.GET(new NextRequest('https://test/api/fear-greed-custom'))).status).toBe(401);
    expect((await oi.GET(new NextRequest('https://test/api/open-interest'))).status).toBe(401);
    expect((await pool.GET(new NextRequest('https://test/api/crypto/pool-pressure?network=eth&address=0xabc'))).status).toBe(401);
    expect(cg.getGlobalData).not.toHaveBeenCalled();
    expect(cg.getPoolWithVolumeBreakdown).not.toHaveBeenCalled();
  });

  it('a warmed fear and greed cache is not returned to a signed-out caller', async () => {
    session.current = { workspaceId: 'ws', tier: 'pro', cid: 'c' };
    cg.getGlobalData.mockResolvedValue({ updated_at: Date.parse('2026-10-03T10:00:00Z') / 1000, market_cap_percentage: { usdt: 5, usdc: 3 }, market_cap_change_percentage_24h_usd: 2 });
    cg.getGlobalMarketCapChart.mockResolvedValue({ market_cap_chart: { market_cap: [[Date.parse('2026-10-03'), 100]] } });
    const { GET } = await import('@/app/api/fear-greed/route');
    expect((await GET(new NextRequest('https://test/api/fear-greed'))).status).toBe(200);
    session.current = null;
    const denied = await GET(new NextRequest('https://test/api/fear-greed'));
    expect(denied.status).toBe(401);
    expect(await denied.json()).not.toHaveProperty('history');
  });

  it('an anonymous crypto scan is refused before CoinGecko candles are read', async () => {
    const { POST } = await import('@/app/api/scanner/run/route');
    const res = await POST(new NextRequest('https://test/api/scanner/run', {
      method: 'POST',
      body: JSON.stringify({ type: 'crypto', timeframe: 'daily' }),
    }));
    expect(res.status).toBe(401);
    expect(cg.getOHLC).not.toHaveBeenCalled();
    expect(cg.getOHLCWithVolume).not.toHaveBeenCalled();
    expect(cg.getGlobalData).not.toHaveBeenCalled();
  });
});
