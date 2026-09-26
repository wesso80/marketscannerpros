import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn() }));
vi.mock('@/lib/coingecko', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/coingecko')>(), getCryptoNews: vi.fn(),
}));
import { getSessionFromCookie } from '@/lib/auth';
import { getCryptoNews, type CryptoNewsItem } from '@/lib/coingecko';
import { GET as news } from '@/app/api/crypto/cg-news/route';
import { isCryptoRelevantNews } from '@/lib/crypto/newsRelevance';

const item = (title: string, extra: Partial<CryptoNewsItem> = {}): CryptoNewsItem => ({
  title, url: `https://example.test/${encodeURIComponent(title)}`, image: '', author: '', posted_at: '2026-09-25T17:00:00Z',
  type: 'news', source_name: 'Example', related_coin_ids: [], ...extra,
});

describe('isCryptoRelevantNews', () => {
  it.each([
    'NetApp, Inc. (NTAP) Stock: Rise as PEAK:AIO Acquisition Expands AI Storage Push',
    "Susan Collins' odds improve in competitive Maine Senate race",
    'European Union debates limits on Big Tech access to cloud tenders',
    'Optimism grows as stellar earnings send an avalanche of buyers into tech',
    'Ripple effects of DOGE cuts felt across federal agencies',
    'Fed holds rates steady; Treasury yields slip',
  ])('drops off-topic: %s', title => {
    expect(isCryptoRelevantNews(item(title))).toBe(false);
  });

  it.each([
    'Bitcoin slips below $84K as ETF outflows continue',
    'BTC funding rates flip negative',
    'Ethereum developers set Fusaka upgrade date',
    'ETH/BTC ratio hits a new low',
    'Solana DEX volume tops $5B',
    'XRP ledger adds new amendment',
    'Stablecoin bill clears Senate committee',
    'Crypto market cap falls to $2.89T',
    'Coinbase lists new token',
    'Tokenized treasuries pass $10B',
    'On-chain data shows whales accumulating',
    'Layer-2 fees drop after upgrade',
  ])('keeps crypto: %s', title => {
    expect(isCryptoRelevantNews(item(title))).toBe(true);
  });

  it('matches whole words only', () => {
    expect(isCryptoRelevantNews(item('Tethered drones and ethics boards'))).toBe(false);
    expect(isCryptoRelevantNews(item('Methane rules tightened'))).toBe(false);
  });

  it('ignores related_coin_ids (auto-tagged from ordinary words) and always keeps guides', () => {
    expect(isCryptoRelevantNews(item('European Union debates limits on cloud tenders', { related_coin_ids: ['could', 'union-2'] }))).toBe(false);
    expect(isCryptoRelevantNews(item('Implied Volatility and IV Crush in Options Explained', { type: 'guide' }))).toBe(true);
    expect(isCryptoRelevantNews({ title: null, type: 'news' })).toBe(false);
  });
});

describe('/api/crypto/cg-news relevance filter', () => {
  const feed = [
    item('Bitcoin holds $83K'),
    item('NetApp, Inc. (NTAP) Stock: Rise as PEAK:AIO Acquisition Expands', { posted_at: '2026-09-25T18:00:00Z' }),
    item("Susan Collins' odds improve in competitive Maine Senate race"),
    item('Ethereum gas hits a yearly low'),
  ];
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSessionFromCookie).mockResolvedValue({ workspaceId: 'workspace-a', tier: 'pro' } as any);
    vi.mocked(getCryptoNews).mockResolvedValue(feed);
  });

  it('general feed keeps crypto items only and reports how many were excluded', async () => {
    const body = await (await news(new NextRequest('https://example.test/api/crypto/cg-news?per_page=20'))).json();
    expect(body.articles.map((a: CryptoNewsItem) => a.title)).toEqual(['Bitcoin holds $83K', 'Ethereum gas hits a yearly low']);
    expect(body.count).toBe(2);
    expect(body.excluded_off_topic).toBe(2);
    // Freshness reflects what is shown, not the dropped NetApp story's later timestamp.
    expect(body.timestamp).toBe('2026-09-25T17:00:00.000Z');
  });

  it('a coin-specific request keeps only items naming that coin or ticker (MV-2: CoinGecko auto-tags coins from ordinary words)', async () => {
    const body = await (await news(new NextRequest('https://example.test/api/crypto/cg-news?coin_id=bitcoin'))).json();
    expect(body.articles.map((a: CryptoNewsItem) => a.title)).toEqual(['Bitcoin holds $83K']);
    expect(body.count).toBe(1);
    expect(body.excluded_off_topic).toBe(3);
  });
});
