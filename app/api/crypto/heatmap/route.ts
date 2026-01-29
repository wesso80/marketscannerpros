import { NextRequest, NextResponse } from 'next/server';
import { getMarketData, CoinGeckoMarketData } from '@/lib/coingecko';

// Top cryptocurrencies with display config
const CRYPTO_CONFIG: Record<string, { weight: number; color: string }> = {
  'bitcoin': { weight: 55, color: '#F7931A' },
  'ethereum': { weight: 17, color: '#627EEA' },
  'binancecoin': { weight: 4, color: '#F3BA2F' },
  'solana': { weight: 3.5, color: '#00FFA3' },
  'ripple': { weight: 3, color: '#23292F' },
  'cardano': { weight: 2, color: '#0033AD' },
  'dogecoin': { weight: 2, color: '#C2A633' },
  'avalanche-2': { weight: 1.5, color: '#E84142' },
  'polkadot': { weight: 1.2, color: '#E6007A' },
  'matic-network': { weight: 1, color: '#8247E5' },
  'chainlink': { weight: 1, color: '#2A5ADA' },
  'litecoin': { weight: 0.8, color: '#345D9D' },
  'shiba-inu': { weight: 0.7, color: '#FFA409' },
  'uniswap': { weight: 0.6, color: '#FF007A' },
  'cosmos': { weight: 0.5, color: '#2E3148' },
  'stellar': { weight: 0.5, color: '#14B6E7' },
};

const CRYPTO_IDS = Object.keys(CRYPTO_CONFIG);

interface CryptoData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  weight: number;
  color: string;
  volume?: number;
  marketCap?: number;
}

// GET /api/crypto/heatmap - Get crypto performance data via CoinGecko
export async function GET(req: NextRequest) {
  try {
    // Fetch market data from CoinGecko (single batched API call)
    const marketData = await getMarketData({ ids: CRYPTO_IDS, per_page: 20 });
    
    if (!marketData || marketData.length === 0) {
      return NextResponse.json({
        cryptos: [],
        timestamp: new Date().toISOString(),
        source: 'coingecko',
        error: 'Failed to fetch market data'
      }, { status: 500 });
    }

    const cryptos: CryptoData[] = marketData.map((coin: CoinGeckoMarketData) => {
      const config = CRYPTO_CONFIG[coin.id] || { weight: 0.5, color: '#888888' };
      
      return {
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        price: coin.current_price,
        change: coin.price_change_24h || 0,
        changePercent: coin.price_change_percentage_24h || 0,
        weight: config.weight,
        color: config.color,
        volume: coin.total_volume,
        marketCap: coin.market_cap,
      };
    });

    // Sort by weight (market cap proxy)
    cryptos.sort((a, b) => b.weight - a.weight);

    return NextResponse.json({
      cryptos,
      timestamp: new Date().toISOString(),
      source: 'coingecko'
    });
    
  } catch (error) {
    console.error('Error fetching crypto data:', error);
    return NextResponse.json({ error: 'Failed to fetch crypto data' }, { status: 500 });
  }
}
