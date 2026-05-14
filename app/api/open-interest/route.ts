import { NextRequest, NextResponse } from 'next/server';
import {
  buildCoinGeckoResponseMeta,
  getAggregatedOpenInterest,
  getMarketData,
  symbolToId,
} from '@/lib/coingecko';

const CACHE_DURATION = 600; // 10 minute cache
let cache: { data: any; timestamp: number } | null = null;

// Historical OI cache for 24h change (we track snapshots ourselves since CoinGecko lacks historical OI)
let historicalSnapshot: { data: Map<string, number>; timestamp: number } | null = null;
const SNAPSHOT_INTERVAL = 3600 * 1000; // Save snapshot every hour

// Top coins to track OI
const SYMBOLS = [
  'BTC', 'ETH', 'BNB', 'SOL', 'XRP',
  'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK',
  'MATIC', 'LTC', 'BCH', 'ATOM', 'UNI',
  'XLM', 'NEAR', 'APT', 'ARB', 'OP'
];

interface CoinOI {
  symbol: string;
  openInterest: number;
  openInterestCoin?: number;
  price: number;
  change24h?: number;
}

export async function GET(req: NextRequest) {
  // Check cache
  if (cache && Date.now() - cache.timestamp < CACHE_DURATION * 1000) {
    const meta = buildCoinGeckoResponseMeta({
      endpointFamily: 'DERIVATIVES',
      lastUpdated: cache.data?.meta?.lastUpdated ?? new Date(cache.timestamp).toISOString(),
      maxAgeMs: CACHE_DURATION * 1000,
      fallbackUsed: Boolean(cache.data?.meta?.fallbackUsed),
    });
    return NextResponse.json({
      ...cache.data,
      timestamp: meta.lastUpdated,
      source: meta.provider,
      freshnessStatus: meta.freshnessStatus,
      meta,
    });
  }

  try {
    // Fetch OI from CoinGecko derivatives API
    const oiResult = await getAggregatedOpenInterest(SYMBOLS);
    
    if (!oiResult || oiResult.length === 0) {
      throw new Error('No OI data received from CoinGecko');
    }

    // Also fetch prices for reference
    const coinIds = SYMBOLS.map(s => symbolToId(s)).filter((id): id is string => id !== null);
    const marketData = await getMarketData({ ids: coinIds, per_page: 25 });
    const priceMap = new Map<string, number>();
    if (marketData) {
      marketData.forEach((coin: any) => {
        priceMap.set(coin.symbol.toUpperCase(), coin.current_price);
      });
    }

    // Transform data
    const oiData: CoinOI[] = oiResult.map(item => ({
      symbol: item.symbol,
      openInterest: item.totalOpenInterest,
      price: priceMap.get(item.symbol) || 0,
    }));

    // Calculate 24h change using our own snapshots
    const currentOiMap = new Map<string, number>();
    oiData.forEach(coin => currentOiMap.set(coin.symbol, coin.openInterest));
    
    // Save snapshot periodically for future 24h comparison
    if (!historicalSnapshot || Date.now() - historicalSnapshot.timestamp > SNAPSHOT_INTERVAL) {
      historicalSnapshot = { data: new Map(currentOiMap), timestamp: Date.now() };
    }

    // Apply 24h change if we have historical data
    if (historicalSnapshot) {
      oiData.forEach(coin => {
        const historical = historicalSnapshot!.data.get(coin.symbol);
        if (historical && historical > 0) {
          coin.change24h = ((coin.openInterest - historical) / historical) * 100;
        }
      });
    }

    // Calculate totals
    const totalOI = oiData.reduce((sum, d) => sum + d.openInterest, 0);
    const btcData = oiData.find(d => d.symbol === 'BTC');
    const ethData = oiData.find(d => d.symbol === 'ETH');
    const btcOI = btcData?.openInterest || 0;
    const ethOI = ethData?.openInterest || 0;
    const altOI = totalOI - btcOI - ethOI;

    const fetchedAt = new Date().toISOString();
    const meta = buildCoinGeckoResponseMeta({
      endpointFamily: 'DERIVATIVES',
      lastUpdated: fetchedAt,
      maxAgeMs: CACHE_DURATION * 1000,
    });

    const result = {
      total: {
        openInterest: totalOI,
        formatted: formatUSD(totalOI),
        btcDominance: totalOI > 0 ? ((btcOI / totalOI) * 100).toFixed(1) : '0',
        ethDominance: totalOI > 0 ? ((ethOI / totalOI) * 100).toFixed(1) : '0',
        altDominance: totalOI > 0 ? ((altOI / totalOI) * 100).toFixed(1) : '0',
        change24h: btcData?.change24h || undefined,
      },
      btc: btcData ? {
        openInterest: btcOI,
        formatted: formatUSD(btcOI),
        price: btcData.price,
        change24h: btcData.change24h,
      } : null,
      eth: ethData ? {
        openInterest: ethOI,
        formatted: formatUSD(ethOI),
        price: ethData.price,
        change24h: ethData.change24h,
      } : null,
      coins: oiData.sort((a, b) => b.openInterest - a.openInterest),
      source: meta.provider,
      exchange: 'Aggregated (Multiple Exchanges)',
      timestamp: meta.lastUpdated,
      cachedAt: meta.lastUpdated,
      freshnessStatus: meta.freshnessStatus,
      meta,
    };

    cache = { data: result, timestamp: Date.now() };
    return NextResponse.json(result);

  } catch (error) {
    console.error('Open Interest API error:', error);

    // Return cached data if available
    if (cache) {
      const meta = buildCoinGeckoResponseMeta({
        endpointFamily: 'DERIVATIVES',
        lastUpdated: cache.data?.meta?.lastUpdated ?? new Date(cache.timestamp).toISOString(),
        maxAgeMs: CACHE_DURATION * 1000,
        fallbackUsed: true,
      });
      return NextResponse.json({
        ...cache.data,
        stale: true,
        error: 'Using cached data due to API error',
        timestamp: meta.lastUpdated,
        source: meta.provider,
        freshnessStatus: meta.freshnessStatus,
        meta,
      });
    }

    return NextResponse.json(
      { error: 'Failed to fetch Open Interest data' },
      { status: 500 }
    );
  }
}

function formatUSD(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(0)}`;
}
