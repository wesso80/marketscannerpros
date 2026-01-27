import { NextRequest, NextResponse } from 'next/server';

const CACHE_DURATION = 300; // 5 minute cache
let cache: { data: any; timestamp: number } | null = null;

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'BNBUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT'];

interface OpenInterestData {
  symbol: string;
  openInterest: number;        // In contracts
  openInterestValue: number;   // In USD
  change24h: number;           // % change
  signal: 'longs_building' | 'shorts_building' | 'deleveraging' | 'neutral';
}

export async function GET(req: NextRequest) {
  if (cache && Date.now() - cache.timestamp < CACHE_DURATION * 1000) {
    return NextResponse.json(cache.data);
  }

  try {
    const oiPromises = SYMBOLS.map(async (symbol): Promise<OpenInterestData | null> => {
      try {
        // Get current OI
        const [oiRes, priceRes] = await Promise.all([
          fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`, {
            headers: { 'Accept': 'application/json' }
          }),
          fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`, {
            headers: { 'Accept': 'application/json' }
          })
        ]);

        if (!oiRes.ok || !priceRes.ok) return null;

        const oiData = await oiRes.json();
        const priceData = await priceRes.json();
        
        const oi = parseFloat(oiData.openInterest);
        const price = parseFloat(priceData.price);
        const oiValue = oi * price;

        // Get historical OI for 24h change (using klines as proxy)
        const histRes = await fetch(
          `https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=1h&limit=24`,
          { headers: { 'Accept': 'application/json' } }
        );
        
        let change24h = 0;
        let signal: OpenInterestData['signal'] = 'neutral';
        
        if (histRes.ok) {
          const histData = await histRes.json();
          if (histData && histData.length >= 2) {
            const oldOI = parseFloat(histData[0].sumOpenInterest);
            const newOI = parseFloat(histData[histData.length - 1].sumOpenInterest);
            change24h = ((newOI - oldOI) / oldOI) * 100;
            
            // Determine signal based on OI change
            if (change24h > 5) signal = 'longs_building';
            else if (change24h < -5) signal = 'deleveraging';
            else if (change24h > 2) signal = 'longs_building';
            else if (change24h < -2) signal = 'shorts_building';
          }
        }

        return {
          symbol: symbol.replace('USDT', ''),
          openInterest: oi,
          openInterestValue: oiValue,
          change24h,
          signal,
        };
      } catch {
        return null;
      }
    });

    const results = await Promise.all(oiPromises);
    const oiData = results.filter((r): r is OpenInterestData => r !== null);

    if (oiData.length === 0) {
      throw new Error('No OI data retrieved');
    }

    // Calculate totals
    const totalOI = oiData.reduce((sum, r) => sum + r.openInterestValue, 0);
    const avgChange = oiData.reduce((sum, r) => sum + r.change24h, 0) / oiData.length;
    
    // Overall market signal
    let marketSignal: 'risk_on' | 'risk_off' | 'neutral';
    const positiveChanges = oiData.filter(r => r.change24h > 2).length;
    const negativeChanges = oiData.filter(r => r.change24h < -2).length;
    
    if (positiveChanges >= 6) marketSignal = 'risk_on';
    else if (negativeChanges >= 6) marketSignal = 'risk_off';
    else marketSignal = 'neutral';

    const result = {
      summary: {
        totalOpenInterest: totalOI,
        totalFormatted: formatLargeNumber(totalOI),
        avgChange24h: avgChange.toFixed(2),
        marketSignal,
        interpretation: marketSignal === 'risk_on' 
          ? '🟢 Longs building - bullish positioning'
          : marketSignal === 'risk_off'
          ? '🔴 Deleveraging - risk-off mode'
          : '⚪ Neutral positioning',
      },
      coins: oiData.sort((a, b) => b.openInterestValue - a.openInterestValue),
      source: 'binance',
      timestamp: new Date().toISOString(),
    };

    cache = { data: result, timestamp: Date.now() };
    return NextResponse.json(result);

  } catch (error) {
    console.error('Open Interest API error:', error);
    
    if (cache) {
      return NextResponse.json({ ...cache.data, stale: true });
    }
    
    return NextResponse.json({ error: 'Failed to fetch open interest' }, { status: 500 });
  }
}

function formatLargeNumber(num: number): string {
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}
