import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { COINGECKO_ID_MAP, getOHLC, getAggregatedFundingRates, getAggregatedOpenInterest } from '@/lib/coingecko';

const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;
const BASE_URL = 'https://pro-api.coingecko.com/api/v3';
const FREE_URL = 'https://api.coingecko.com/api/v3';

const getBaseUrl = () => COINGECKO_API_KEY ? BASE_URL : FREE_URL;
const getHeaders = (): HeadersInit => {
  const headers: HeadersInit = { 'Accept': 'application/json' };
  if (COINGECKO_API_KEY) {
    headers['x-cg-pro-api-key'] = COINGECKO_API_KEY;
  }
  return headers;
};

interface CoinDetail {
  id: string;
  symbol: string;
  name: string;
  web_slug: string;
  image?: {
    thumb: string;
    small: string;
    large: string;
  };
  description?: { en: string };
  links?: {
    homepage: string[];
    whitepaper?: string;
    blockchain_site: string[];
    official_forum_url: string[];
    subreddit_url?: string;
    twitter_screen_name?: string;
    telegram_channel_identifier?: string;
    repos_url?: { github: string[]; bitbucket: string[] };
  };
  genesis_date?: string;
  hashing_algorithm?: string;
  categories?: string[];
  sentiment_votes_up_percentage?: number;
  sentiment_votes_down_percentage?: number;
  watchlist_portfolio_users?: number;
  market_cap_rank?: number;
  market_data?: {
    current_price: Record<string, number>;
    ath: Record<string, number>;
    ath_change_percentage: Record<string, number>;
    ath_date: Record<string, string>;
    atl: Record<string, number>;
    atl_change_percentage: Record<string, number>;
    atl_date: Record<string, string>;
    market_cap: Record<string, number>;
    market_cap_rank?: number;
    fully_diluted_valuation?: Record<string, number>;
    total_volume: Record<string, number>;
    high_24h: Record<string, number>;
    low_24h: Record<string, number>;
    price_change_24h: number;
    price_change_percentage_24h: number;
    price_change_percentage_7d: number;
    price_change_percentage_14d: number;
    price_change_percentage_30d: number;
    price_change_percentage_60d: number;
    price_change_percentage_200d: number;
    price_change_percentage_1y: number;
    market_cap_change_24h: number;
    market_cap_change_percentage_24h: number;
    total_supply?: number;
    max_supply?: number;
    circulating_supply?: number;
    sparkline_7d?: { price: number[] };
    last_updated: string;
  };
  developer_data?: {
    forks?: number;
    stars?: number;
    subscribers?: number;
    total_issues?: number;
    closed_issues?: number;
    pull_requests_merged?: number;
    pull_request_contributors?: number;
    code_additions_deletions_4_weeks?: { additions?: number; deletions?: number };
    commit_count_4_weeks?: number;
  };
  tickers?: Array<{
    base: string;
    target: string;
    market: { name: string; identifier: string };
    last: number;
    volume: number;
    converted_last: { btc: number; eth: number; usd: number };
    converted_volume: { btc: number; eth: number; usd: number };
    bid_ask_spread_percentage?: number;
    timestamp: string;
    trade_url?: string;
    is_anomaly: boolean;
    is_stale: boolean;
  }>;
}

async function getCoinDetail(coinId: string): Promise<CoinDetail | null> {
  try {
    const params = new URLSearchParams({
      localization: 'false',
      tickers: 'true',
      market_data: 'true',
      community_data: 'false',
      developer_data: 'true',
      sparkline: 'true',
    });
    
    const response = await fetch(
      `${getBaseUrl()}/coins/${coinId}?${params}`,
      { headers: getHeaders(), next: { revalidate: 60 } }
    );
    
    if (!response.ok) {
      console.error('CoinGecko coin detail error:', response.status);
      return null;
    }
    
    return response.json();
  } catch (error) {
    console.error('Error fetching coin detail:', error);
    return null;
  }
}

async function searchCoins(query: string): Promise<Array<{ id: string; symbol: string; name: string; thumb: string }>> {
  try {
    const response = await fetch(
      `${getBaseUrl()}/search?query=${encodeURIComponent(query)}`,
      { headers: getHeaders(), next: { revalidate: 300 } }
    );
    
    if (!response.ok) return [];
    
    const data = await response.json();
    return (data.coins || []).slice(0, 10).map((c: { id: string; symbol: string; name: string; thumb: string }) => ({
      id: c.id,
      symbol: c.symbol,
      name: c.name,
      thumb: c.thumb
    }));
  } catch (error) {
    console.error('Error searching coins:', error);
    return [];
  }
}

async function getCoinMarketChart(coinId: string, days: number = 30): Promise<{
  prices: [number, number][];
  market_caps: [number, number][];
  total_volumes: [number, number][];
} | null> {
  try {
    const response = await fetch(
      `${getBaseUrl()}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`,
      { headers: getHeaders(), next: { revalidate: 300 } }
    );
    
    if (!response.ok) return null;
    return response.json();
  } catch (error) {
    console.error('Error fetching market chart:', error);
    return null;
  }
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const symbol = searchParams.get('symbol');
  const query = searchParams.get('q');
  
  // Search for coins
  if (action === 'search' && query) {
    const results = await searchCoins(query);
    return NextResponse.json({ coins: results });
  }
  
  // Get comprehensive coin detail
  if (action === 'detail' && symbol) {
    // Convert symbol to CoinGecko ID
    const coinId = COINGECKO_ID_MAP[symbol.toUpperCase()] || symbol.toLowerCase();
    
    // Fetch all data in parallel
    const [coinDetail, ohlcData, chartData] = await Promise.all([
      getCoinDetail(coinId),
      getOHLC(coinId, 30).catch(() => []),
      getCoinMarketChart(coinId, 30).catch(() => null),
    ]);
    
    if (!coinDetail) {
      return NextResponse.json({ error: 'Coin not found' }, { status: 404 });
    }
    
    // Try to get derivatives data if available
    let fundingRates: { rate: number; sentiment: string } | null = null;
    let openInterest: { total: number; avgVolume24h: number } | null = null;
    try {
      const derivSymbol = symbol.toUpperCase().replace('USDT', '');
      const [fundingData, oiData] = await Promise.all([
        getAggregatedFundingRates([derivSymbol]),
        getAggregatedOpenInterest([derivSymbol]),
      ]);
      // These return arrays, find matching symbol
      const fundingItem = fundingData.find(f => f.symbol.toUpperCase() === derivSymbol);
      const oiItem = oiData.find(o => o.symbol.toUpperCase() === derivSymbol);
      if (fundingItem) {
        fundingRates = { rate: fundingItem.fundingRatePercent, sentiment: fundingItem.sentiment };
      }
      if (oiItem) {
        openInterest = { total: oiItem.totalOpenInterest, avgVolume24h: oiItem.avgVolume24h };
      }
    } catch {
      // Derivatives data not available for this coin
    }
    
    // Structure comprehensive response
    return NextResponse.json({
      coin: {
        id: coinDetail.id,
        symbol: coinDetail.symbol.toUpperCase(),
        name: coinDetail.name,
        image: coinDetail.image?.large || coinDetail.image?.small,
        description: coinDetail.description?.en?.split('.').slice(0, 3).join('.') + '.' || '',
        links: {
          homepage: coinDetail.links?.homepage?.[0],
          whitepaper: coinDetail.links?.whitepaper,
          twitter: coinDetail.links?.twitter_screen_name ? `https://twitter.com/${coinDetail.links.twitter_screen_name}` : null,
          reddit: coinDetail.links?.subreddit_url,
          github: coinDetail.links?.repos_url?.github?.[0],
          blockchain: coinDetail.links?.blockchain_site?.[0],
        },
        categories: coinDetail.categories || [],
        genesis_date: coinDetail.genesis_date,
        hashing_algorithm: coinDetail.hashing_algorithm,
      },
      sentiment: {
        votes_up_percentage: coinDetail.sentiment_votes_up_percentage,
        votes_down_percentage: coinDetail.sentiment_votes_down_percentage,
        watchlist_users: coinDetail.watchlist_portfolio_users,
      },
      market: {
        rank: coinDetail.market_cap_rank,
        price_usd: coinDetail.market_data?.current_price?.usd,
        price_btc: coinDetail.market_data?.current_price?.btc,
        price_eth: coinDetail.market_data?.current_price?.eth,
        market_cap: coinDetail.market_data?.market_cap?.usd,
        fully_diluted_valuation: coinDetail.market_data?.fully_diluted_valuation?.usd,
        total_volume_24h: coinDetail.market_data?.total_volume?.usd,
        high_24h: coinDetail.market_data?.high_24h?.usd,
        low_24h: coinDetail.market_data?.low_24h?.usd,
        circulating_supply: coinDetail.market_data?.circulating_supply,
        total_supply: coinDetail.market_data?.total_supply,
        max_supply: coinDetail.market_data?.max_supply,
        ath: {
          usd: coinDetail.market_data?.ath?.usd,
          change_percentage: coinDetail.market_data?.ath_change_percentage?.usd,
          date: coinDetail.market_data?.ath_date?.usd,
        },
        atl: {
          usd: coinDetail.market_data?.atl?.usd,
          change_percentage: coinDetail.market_data?.atl_change_percentage?.usd,
          date: coinDetail.market_data?.atl_date?.usd,
        },
      },
      price_changes: {
        '24h': coinDetail.market_data?.price_change_percentage_24h,
        '7d': coinDetail.market_data?.price_change_percentage_7d,
        '14d': coinDetail.market_data?.price_change_percentage_14d,
        '30d': coinDetail.market_data?.price_change_percentage_30d,
        '60d': coinDetail.market_data?.price_change_percentage_60d,
        '200d': coinDetail.market_data?.price_change_percentage_200d,
        '1y': coinDetail.market_data?.price_change_percentage_1y,
      },
      developer: coinDetail.developer_data ? {
        github_stars: coinDetail.developer_data.stars,
        github_forks: coinDetail.developer_data.forks,
        subscribers: coinDetail.developer_data.subscribers,
        total_issues: coinDetail.developer_data.total_issues,
        closed_issues: coinDetail.developer_data.closed_issues,
        pull_requests_merged: coinDetail.developer_data.pull_requests_merged,
        contributors: coinDetail.developer_data.pull_request_contributors,
        commits_4_weeks: coinDetail.developer_data.commit_count_4_weeks,
        additions_4_weeks: coinDetail.developer_data.code_additions_deletions_4_weeks?.additions,
        deletions_4_weeks: coinDetail.developer_data.code_additions_deletions_4_weeks?.deletions,
      } : null,
      tickers: (coinDetail.tickers || []).slice(0, 20).map(t => ({
        exchange: t.market.name,
        pair: `${t.base}/${t.target}`,
        price: t.last,
        volume_usd: t.converted_volume?.usd,
        spread: t.bid_ask_spread_percentage,
        trade_url: t.trade_url,
        is_stale: t.is_stale,
      })),
      ohlc: ohlcData,
      chart: chartData ? {
        prices: chartData.prices?.slice(-100) || [],
        volumes: chartData.total_volumes?.slice(-100) || [],
      } : null,
      sparkline: coinDetail.market_data?.sparkline_7d?.price,
      derivatives: fundingRates || openInterest ? {
        funding_rate: fundingRates?.rate,
        funding_sentiment: fundingRates?.sentiment,
        open_interest: openInterest?.total,
        volume_24h: openInterest?.avgVolume24h,
      } : null,
      last_updated: coinDetail.market_data?.last_updated,
    });
  }
  
  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
