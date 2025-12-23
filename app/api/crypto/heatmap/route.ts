import { NextRequest, NextResponse } from 'next/server';

// Top cryptocurrencies by market cap with Yahoo Finance symbols
const CRYPTO_LIST = [
  { symbol: 'BTC', yahooSymbol: 'BTC-USD', name: 'Bitcoin', weight: 55, color: '#F7931A' },
  { symbol: 'ETH', yahooSymbol: 'ETH-USD', name: 'Ethereum', weight: 17, color: '#627EEA' },
  { symbol: 'BNB', yahooSymbol: 'BNB-USD', name: 'BNB', weight: 4, color: '#F3BA2F' },
  { symbol: 'SOL', yahooSymbol: 'SOL-USD', name: 'Solana', weight: 3.5, color: '#00FFA3' },
  { symbol: 'XRP', yahooSymbol: 'XRP-USD', name: 'XRP', weight: 3, color: '#23292F' },
  { symbol: 'ADA', yahooSymbol: 'ADA-USD', name: 'Cardano', weight: 2, color: '#0033AD' },
  { symbol: 'DOGE', yahooSymbol: 'DOGE-USD', name: 'Dogecoin', weight: 2, color: '#C2A633' },
  { symbol: 'AVAX', yahooSymbol: 'AVAX-USD', name: 'Avalanche', weight: 1.5, color: '#E84142' },
  { symbol: 'DOT', yahooSymbol: 'DOT-USD', name: 'Polkadot', weight: 1.2, color: '#E6007A' },
  { symbol: 'MATIC', yahooSymbol: 'MATIC-USD', name: 'Polygon', weight: 1, color: '#8247E5' },
  { symbol: 'LINK', yahooSymbol: 'LINK-USD', name: 'Chainlink', weight: 1, color: '#2A5ADA' },
  { symbol: 'LTC', yahooSymbol: 'LTC-USD', name: 'Litecoin', weight: 0.8, color: '#345D9D' },
  { symbol: 'SHIB', yahooSymbol: 'SHIB-USD', name: 'Shiba Inu', weight: 0.7, color: '#FFA409' },
  { symbol: 'UNI', yahooSymbol: 'UNI-USD', name: 'Uniswap', weight: 0.6, color: '#FF007A' },
  { symbol: 'ATOM', yahooSymbol: 'ATOM-USD', name: 'Cosmos', weight: 0.5, color: '#2E3148' },
  { symbol: 'XLM', yahooSymbol: 'XLM-USD', name: 'Stellar', weight: 0.5, color: '#14B6E7' },
];

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

// Fetch data from Yahoo Finance
async function fetchYahooQuote(yahooSymbol: string): Promise<{
  price: number;
  change: number;
  changePercent: number;
  volume?: number;
  marketCap?: number;
} | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=2d`;
    
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!res.ok) return null;
    
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    
    if (!result) return null;
    
    const meta = result.meta;
    const quote = result.indicators?.quote?.[0];
    
    const price = meta.regularMarketPrice || 0;
    const prevClose = meta.previousClose || meta.chartPreviousClose || price;
    const change = price - prevClose;
    const changePercent = prevClose > 0 ? ((change / prevClose) * 100) : 0;
    
    // Get latest volume from quote data
    const volumes = quote?.volume || [];
    const volume = volumes[volumes.length - 1] || 0;
    
    return {
      price,
      change,
      changePercent,
      volume,
      marketCap: meta.marketCap
    };
  } catch (e) {
    console.error(`Yahoo quote error for ${yahooSymbol}:`, e);
    return null;
  }
}

// GET /api/crypto/heatmap - Get crypto performance data via Yahoo Finance
export async function GET(req: NextRequest) {
  try {
    const cryptos: CryptoData[] = [];
    
    // Fetch all cryptos in parallel (Yahoo Finance handles rate limits well)
    const fetchPromises = CRYPTO_LIST.map(async (crypto) => {
      const quote = await fetchYahooQuote(crypto.yahooSymbol);
      
      if (quote) {
        return {
          symbol: crypto.symbol,
          name: crypto.name,
          price: quote.price,
          change: quote.change,
          changePercent: quote.changePercent,
          weight: crypto.weight,
          color: crypto.color,
          volume: quote.volume,
          marketCap: quote.marketCap,
        };
      }
      
      // Return with 0 values if fetch failed
      return {
        symbol: crypto.symbol,
        name: crypto.name,
        price: 0,
        change: 0,
        changePercent: 0,
        weight: crypto.weight,
        color: crypto.color,
      };
    });
    
    const results = await Promise.all(fetchPromises);
    
    return NextResponse.json({
      cryptos: results,
      timestamp: new Date().toISOString(),
      source: 'yahoo_finance'
    });
    
  } catch (error) {
    console.error('Error fetching crypto data:', error);
    return NextResponse.json({ error: 'Failed to fetch crypto data' }, { status: 500 });
  }
}
    });
    
  } catch (error) {
    console.error('Error fetching crypto data:', error);
    return NextResponse.json({ error: 'Failed to fetch crypto data' }, { status: 500 });
  }
}
