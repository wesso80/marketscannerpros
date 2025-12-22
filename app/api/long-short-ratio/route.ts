import { NextRequest, NextResponse } from 'next/server';

const CACHE_DURATION = 300; // 5 minute cache
let cache: { data: any; timestamp: number } | null = null;

// Top coins to track
const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'BNBUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT'];

interface LSRatio {
  symbol: string;
  longShortRatio: number;
  longAccount: number;  // % of accounts long
  shortAccount: number; // % of accounts short
  timestamp: number;
}

export async function GET(req: NextRequest) {
  // Check cache
  if (cache && Date.now() - cache.timestamp < CACHE_DURATION * 1000) {
    return NextResponse.json(cache.data);
  }

  try {
    const ratioPromises = SYMBOLS.map(async (symbol): Promise<LSRatio | null> => {
      try {
        const res = await fetch(
          `https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=5m&limit=1`,
          { headers: { 'Accept': 'application/json' } }
        );

        if (!res.ok) return null;

        const data = await res.json();
        if (!data || !data[0]) return null;

        return {
          symbol: symbol.replace('USDT', ''),
          longShortRatio: parseFloat(data[0].longShortRatio),
          longAccount: parseFloat(data[0].longAccount) * 100,
          shortAccount: parseFloat(data[0].shortAccount) * 100,
          timestamp: data[0].timestamp,
        };
      } catch {
        return null;
      }
    });

    const results = await Promise.all(ratioPromises);
    const ratios = results.filter((r): r is LSRatio => r !== null);

    if (ratios.length === 0) {
      throw new Error('No L/S ratio data retrieved');
    }

    // Calculate averages
    const avgRatio = ratios.reduce((sum, r) => sum + r.longShortRatio, 0) / ratios.length;
    const avgLong = ratios.reduce((sum, r) => sum + r.longAccount, 0) / ratios.length;
    const avgShort = ratios.reduce((sum, r) => sum + r.shortAccount, 0) / ratios.length;

    // Determine sentiment
    let sentiment: 'Bullish' | 'Bearish' | 'Neutral';
    if (avgRatio > 1.2) sentiment = 'Bullish';
    else if (avgRatio < 0.8) sentiment = 'Bearish';
    else sentiment = 'Neutral';

    const result = {
      average: {
        longShortRatio: avgRatio.toFixed(2),
        longPercent: avgLong.toFixed(1),
        shortPercent: avgShort.toFixed(1),
        sentiment,
      },
      coins: ratios.sort((a, b) => b.longShortRatio - a.longShortRatio),
      source: 'binance',
      exchange: 'Binance Futures',
      timestamp: new Date().toISOString(),
    };

    cache = { data: result, timestamp: Date.now() };
    return NextResponse.json(result);

  } catch (error) {
    console.error('Long/Short Ratio API error:', error);
    
    if (cache) {
      return NextResponse.json({ ...cache.data, stale: true });
    }
    
    return NextResponse.json({ error: 'Failed to fetch L/S ratio' }, { status: 500 });
  }
}
