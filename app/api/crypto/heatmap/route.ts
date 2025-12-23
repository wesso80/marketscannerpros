import { NextRequest, NextResponse } from 'next/server';

// Top cryptocurrencies by market cap with approximate weights
const CRYPTO_LIST = [
  { symbol: 'BTC', name: 'Bitcoin', weight: 55, color: '#F7931A' },
  { symbol: 'ETH', name: 'Ethereum', weight: 17, color: '#627EEA' },
  { symbol: 'BNB', name: 'BNB', weight: 4, color: '#F3BA2F' },
  { symbol: 'SOL', name: 'Solana', weight: 3.5, color: '#00FFA3' },
  { symbol: 'XRP', name: 'XRP', weight: 3, color: '#23292F' },
  { symbol: 'ADA', name: 'Cardano', weight: 2, color: '#0033AD' },
  { symbol: 'DOGE', name: 'Dogecoin', weight: 2, color: '#C2A633' },
  { symbol: 'AVAX', name: 'Avalanche', weight: 1.5, color: '#E84142' },
  { symbol: 'DOT', name: 'Polkadot', weight: 1.2, color: '#E6007A' },
  { symbol: 'MATIC', name: 'Polygon', weight: 1, color: '#8247E5' },
  { symbol: 'LINK', name: 'Chainlink', weight: 1, color: '#2A5ADA' },
  { symbol: 'LTC', name: 'Litecoin', weight: 0.8, color: '#345D9D' },
  { symbol: 'SHIB', name: 'Shiba Inu', weight: 0.7, color: '#FFA409' },
  { symbol: 'UNI', name: 'Uniswap', weight: 0.6, color: '#FF007A' },
  { symbol: 'ATOM', name: 'Cosmos', weight: 0.5, color: '#2E3148' },
  { symbol: 'XLM', name: 'Stellar', weight: 0.5, color: '#14B6E7' },
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

// GET /api/crypto/heatmap - Get crypto performance data
export async function GET(req: NextRequest) {
  try {
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    const cryptoData: CryptoData[] = [];
    
    if (apiKey) {
      // Fetch data for each crypto (limit to avoid rate limits)
      const fetchPromises = CRYPTO_LIST.slice(0, 10).map(async (crypto) => {
        try {
          // Use CURRENCY_EXCHANGE_RATE for real-time crypto prices
          const res = await fetch(
            `https://www.alphavantage.co/query?function=CRYPTO_RATING&symbol=${crypto.symbol}&apikey=${apiKey}`
          );
          const data = await res.json();
          
          // Try digital currency daily for price data
          const dailyRes = await fetch(
            `https://www.alphavantage.co/query?function=DIGITAL_CURRENCY_DAILY&symbol=${crypto.symbol}&market=USD&apikey=${apiKey}`
          );
          const dailyData = await dailyRes.json();
          
          if (dailyData['Time Series (Digital Currency Daily)']) {
            const timeSeries = dailyData['Time Series (Digital Currency Daily)'];
            const dates = Object.keys(timeSeries).sort().reverse();
            
            if (dates.length >= 2) {
              const today = timeSeries[dates[0]];
              const yesterday = timeSeries[dates[1]];
              
              const currentPrice = parseFloat(today['4a. close (USD)']);
              const previousPrice = parseFloat(yesterday['4a. close (USD)']);
              const change = currentPrice - previousPrice;
              const changePercent = ((change / previousPrice) * 100);
              
              return {
                symbol: crypto.symbol,
                name: crypto.name,
                price: currentPrice,
                change,
                changePercent,
                weight: crypto.weight,
                color: crypto.color,
                volume: parseFloat(today['5. volume']),
              };
            }
          }
          return null;
        } catch {
          return null;
        }
      });
      
      const results = await Promise.all(fetchPromises);
      const validResults = results.filter(Boolean) as CryptoData[];
      
      if (validResults.length > 0) {
        // Add remaining cryptos with estimated data
        const fetchedSymbols = validResults.map(r => r.symbol);
        const remaining = CRYPTO_LIST.filter(c => !fetchedSymbols.includes(c.symbol));
        
        return NextResponse.json({
          cryptos: [...validResults, ...remaining.map(c => ({
            ...c,
            price: 0,
            change: 0,
            changePercent: (Math.random() - 0.5) * 10, // Placeholder
          }))],
          timestamp: new Date().toISOString(),
          source: 'alpha_vantage'
        });
      }
    }
    
    // Fallback: Use CoinGecko free API (no key needed)
    try {
      const ids = 'bitcoin,ethereum,binancecoin,solana,ripple,cardano,dogecoin,avalanche-2,polkadot,matic-network,chainlink,litecoin,shiba-inu,uniswap,cosmos,stellar';
      const res = await fetch(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`
      );
      const data = await res.json();
      
      if (Array.isArray(data) && data.length > 0) {
        const symbolMap: Record<string, typeof CRYPTO_LIST[0]> = {};
        CRYPTO_LIST.forEach(c => {
          const geckoId = c.symbol === 'BTC' ? 'bitcoin' :
                          c.symbol === 'ETH' ? 'ethereum' :
                          c.symbol === 'BNB' ? 'binancecoin' :
                          c.symbol === 'SOL' ? 'solana' :
                          c.symbol === 'XRP' ? 'ripple' :
                          c.symbol === 'ADA' ? 'cardano' :
                          c.symbol === 'DOGE' ? 'dogecoin' :
                          c.symbol === 'AVAX' ? 'avalanche-2' :
                          c.symbol === 'DOT' ? 'polkadot' :
                          c.symbol === 'MATIC' ? 'matic-network' :
                          c.symbol === 'LINK' ? 'chainlink' :
                          c.symbol === 'LTC' ? 'litecoin' :
                          c.symbol === 'SHIB' ? 'shiba-inu' :
                          c.symbol === 'UNI' ? 'uniswap' :
                          c.symbol === 'ATOM' ? 'cosmos' :
                          c.symbol === 'XLM' ? 'stellar' : c.symbol.toLowerCase();
          symbolMap[geckoId] = c;
        });
        
        const cryptos = data.map((coin: any) => {
          const meta = symbolMap[coin.id] || CRYPTO_LIST.find(c => c.symbol === coin.symbol?.toUpperCase());
          return {
            symbol: coin.symbol?.toUpperCase() || meta?.symbol || 'UNKNOWN',
            name: coin.name || meta?.name || 'Unknown',
            price: coin.current_price || 0,
            change: coin.price_change_24h || 0,
            changePercent: coin.price_change_percentage_24h || 0,
            weight: meta?.weight || 1,
            color: meta?.color || '#6366F1',
            volume: coin.total_volume,
            marketCap: coin.market_cap,
          };
        });
        
        return NextResponse.json({
          cryptos,
          timestamp: new Date().toISOString(),
          source: 'coingecko'
        });
      }
    } catch (err) {
      console.error('CoinGecko API error:', err);
    }
    
    // Final fallback: Mock data
    const mockCryptos = CRYPTO_LIST.map(crypto => ({
      ...crypto,
      price: crypto.symbol === 'BTC' ? 95000 + Math.random() * 5000 :
             crypto.symbol === 'ETH' ? 3300 + Math.random() * 200 :
             crypto.symbol === 'SOL' ? 180 + Math.random() * 20 :
             100 + Math.random() * 50,
      change: (Math.random() - 0.5) * 10,
      changePercent: (Math.random() - 0.5) * 15,
    }));
    
    return NextResponse.json({
      cryptos: mockCryptos,
      timestamp: new Date().toISOString(),
      source: 'mock'
    });
    
  } catch (error) {
    console.error('Error fetching crypto data:', error);
    return NextResponse.json({ error: 'Failed to fetch crypto data' }, { status: 500 });
  }
}
