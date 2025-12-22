import { NextRequest, NextResponse } from 'next/server';

const CACHE_DURATION = 300; // 5 minute cache
let cache: { data: any; timestamp: number } | null = null;

// Top coins to track OI
const SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
  'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT',
  'MATICUSDT', 'LTCUSDT', 'BCHUSDT', 'ATOMUSDT', 'UNIUSDT',
  'XLMUSDT', 'NEARUSDT', 'APTUSDT', 'ARBUSDT', 'OPUSDT'
];

interface CoinOI {
  symbol: string;
  openInterest: number;
  openInterestCoin: number;
  price: number;
}

export async function GET(req: NextRequest) {
  // Check cache
  if (cache && Date.now() - cache.timestamp < CACHE_DURATION * 1000) {
    return NextResponse.json(cache.data);
  }

  try {
    // Fetch OI for all symbols in parallel with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    
    const oiPromises = SYMBOLS.map(async (symbol): Promise<CoinOI | null> => {
      try {
        const [oiRes, priceRes] = await Promise.all([
          fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          }),
          fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          })
        ]);

        if (!oiRes.ok || !priceRes.ok) return null;

        const oi = await oiRes.json();
        const price = await priceRes.json();

        const openInterestCoin = parseFloat(oi.openInterest);
        const currentPrice = parseFloat(price.price);

        return {
          symbol: symbol.replace('USDT', ''),
          openInterest: openInterestCoin * currentPrice,
          openInterestCoin,
          price: currentPrice,
        };
      } catch {
        return null;
      }
    });

    const oiResults = await Promise.all(oiPromises);
    clearTimeout(timeout);
    const oiData = oiResults.filter((d): d is CoinOI => d !== null);

    if (oiData.length === 0) {
      throw new Error('No OI data received');
    }

    // Calculate totals
    const totalOI = oiData.reduce((sum, d) => sum + d.openInterest, 0);
    const btcData = oiData.find(d => d.symbol === 'BTC');
    const ethData = oiData.find(d => d.symbol === 'ETH');
    const btcOI = btcData?.openInterest || 0;
    const ethOI = ethData?.openInterest || 0;
    const altOI = totalOI - btcOI - ethOI;

    const result = {
      total: {
        openInterest: totalOI,
        formatted: formatUSD(totalOI),
        btcDominance: ((btcOI / totalOI) * 100).toFixed(1),
        ethDominance: ((ethOI / totalOI) * 100).toFixed(1),
        altDominance: ((altOI / totalOI) * 100).toFixed(1),
      },
      btc: btcData ? {
        openInterest: btcOI,
        formatted: formatUSD(btcOI),
        price: btcData.price,
        contracts: btcData.openInterestCoin,
      } : null,
      eth: ethData ? {
        openInterest: ethOI,
        formatted: formatUSD(ethOI),
        price: ethData.price,
        contracts: ethData.openInterestCoin,
      } : null,
      coins: oiData.sort((a, b) => b.openInterest - a.openInterest),
      source: 'binance',
      exchange: 'Binance Futures',
      timestamp: new Date().toISOString(),
      cachedAt: new Date().toISOString(),
    };

    // Update cache
    cache = { data: result, timestamp: Date.now() };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Open Interest API error:', error);

    // Return cached data if available, even if stale
    if (cache) {
      return NextResponse.json({
        ...cache.data,
        stale: true,
        error: 'Using cached data due to API error',
      });
    }

    // Try fallback: CoinGlass public summary
    try {
      const fallbackRes = await fetch('https://open-api.coinglass.com/public/v2/open_interest', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        if (fallbackData?.data) {
          // Map CoinGlass format to our format
          const coins = fallbackData.data.slice(0, 10).map((item: any) => ({
            symbol: item.symbol,
            openInterest: item.openInterest || 0,
            openInterestCoin: item.openInterestAmount || 0,
            price: item.price || 0
          }));
          
          const totalOI = coins.reduce((sum: number, c: any) => sum + c.openInterest, 0);
          const btcData = coins.find((c: any) => c.symbol === 'BTC');
          const ethData = coins.find((c: any) => c.symbol === 'ETH');
          const btcOI = btcData?.openInterest || 0;
          const ethOI = ethData?.openInterest || 0;
          
          const fallbackResult = {
            total: {
              openInterest: totalOI,
              formatted: formatUSD(totalOI),
              btcDominance: totalOI > 0 ? ((btcOI / totalOI) * 100).toFixed(1) : '0',
              ethDominance: totalOI > 0 ? ((ethOI / totalOI) * 100).toFixed(1) : '0',
              altDominance: totalOI > 0 ? (((totalOI - btcOI - ethOI) / totalOI) * 100).toFixed(1) : '0',
            },
            btc: btcData,
            eth: ethData,
            coins,
            source: 'coinglass',
            exchange: 'Aggregated',
            timestamp: new Date().toISOString(),
          };
          
          cache = { data: fallbackResult, timestamp: Date.now() };
          return NextResponse.json(fallbackResult);
        }
      }
    } catch (fallbackError) {
      console.error('Fallback API also failed:', fallbackError);
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
