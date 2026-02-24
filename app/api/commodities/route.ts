import { NextRequest, NextResponse } from 'next/server';
import { avTakeToken } from '@/lib/avRateGovernor';

// Alpha Vantage commodity endpoints
// https://www.alphavantage.co/documentation/#commodities

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';

// Core commodities - simplified for reliability
// GOLD_SILVER_SPOT returns real-time spot price (different format than other commodities)
const COMMODITIES = {
  WTI: { function: 'WTI', name: 'WTI Crude Oil', unit: '$/barrel', category: 'Energy', interval: 'daily' },
  NATURAL_GAS: { function: 'NATURAL_GAS', name: 'Natural Gas', unit: '$/MMBtu', category: 'Energy', interval: 'daily' },
  GOLD: { function: 'GOLD_SILVER_SPOT', symbol: 'GOLD', name: 'Gold', unit: '$/oz', category: 'Metals', isPreciousMetal: true },
  SILVER: { function: 'GOLD_SILVER_SPOT', symbol: 'SILVER', name: 'Silver', unit: '$/oz', category: 'Metals', isPreciousMetal: true },
  COPPER: { function: 'COPPER', name: 'Copper', unit: '$/lb', category: 'Metals', interval: 'monthly' },
  WHEAT: { function: 'WHEAT', name: 'Wheat', unit: '$/bushel', category: 'Agriculture', interval: 'monthly' },
};

// Cache for commodity data (15 minute TTL - commodities update less frequently)
const cache: Map<string, { data: any; timestamp: number }> = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

interface CommodityData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  unit: string;
  category: string;
  date: string;
  history: { date: string; value: number }[];
}

async function fetchCommodity(symbol: keyof typeof COMMODITIES): Promise<CommodityData | null> {
  const cacheKey = `commodity_${symbol}`;
  const cached = cache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[Commodities] Cache hit for ${symbol}`);
    return cached.data;
  }

  try {
    const config = COMMODITIES[symbol];
    
    // Build URL based on commodity type
    let url: string;
    if ('isPreciousMetal' in config && config.isPreciousMetal) {
      // Gold/Silver use GOLD_SILVER_SPOT endpoint (no interval needed)
      url = `https://www.alphavantage.co/query?function=GOLD_SILVER_SPOT&symbol=${config.symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    } else {
      // Other commodities use their function directly with interval
      const interval = 'interval' in config ? config.interval : 'monthly';
      url = `https://www.alphavantage.co/query?function=${config.function}&interval=${interval}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    }
    
    console.log(`[Commodities] Fetching ${symbol}...`);
    
    await avTakeToken();
    const res = await fetch(url, { 
      next: { revalidate: 900 } // 15 min cache
    });
    
    if (!res.ok) {
      console.error(`Failed to fetch ${symbol}: ${res.status}`);
      return null;
    }

    const data = await res.json();
    
    // Check for API errors
    if (data['Error Message'] || data['Note']) {
      console.error(`Alpha Vantage error for ${symbol}:`, data['Error Message'] || data['Note']);
      return null;
    }

    let currentPrice: number;
    let previousPrice: number;
    let latestDate: string;
    let history: { date: string; value: number }[] = [];

    // Handle Gold/Silver spot price format (different from other commodities)
    if ('isPreciousMetal' in config && config.isPreciousMetal) {
      // GOLD_SILVER_SPOT returns: { "symbol": "GOLD", "price": "2853.12", ... }
      if (!data.price) {
        console.error(`No spot price data for ${symbol}:`, JSON.stringify(data));
        return null;
      }
      currentPrice = parseFloat(data.price);
      // Spot endpoint doesn't provide previous price, use 0 change
      previousPrice = currentPrice;
      latestDate = new Date().toISOString().split('T')[0];
      // No history available from spot endpoint
      history = [{ date: latestDate, value: currentPrice }];
    } else {
      // Regular commodities return historical data array
      const dataPoints = data.data;
      if (!dataPoints || !Array.isArray(dataPoints) || dataPoints.length < 2) {
        console.error(`No data for ${symbol}:`, JSON.stringify(data));
        return null;
      }

      // Get latest and previous values
      const latest = dataPoints[0];
      const previous = dataPoints[1];
      
      currentPrice = parseFloat(latest.value);
      previousPrice = parseFloat(previous.value);
      latestDate = latest.date;

      // Get history (30 points for daily, 12 months for monthly)
      const interval = 'interval' in config ? config.interval : 'monthly';
      const historyLimit = interval === 'daily' ? 30 : 12;
      history = dataPoints.slice(0, historyLimit).map((d: any) => ({
        date: d.date,
        value: parseFloat(d.value)
      }));
    }

    const change = currentPrice - previousPrice;
    const changePercent = previousPrice !== 0 ? (change / previousPrice) * 100 : 0;

    const result: CommodityData = {
      symbol,
      name: config.name,
      price: currentPrice,
      change,
      changePercent,
      unit: config.unit,
      category: config.category,
      date: latestDate,
      history,
    };

    cache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  } catch (err) {
    console.error(`Error fetching ${symbol}:`, err);
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get('symbol')?.toUpperCase();

    // If specific symbol requested
    if (symbol && symbol in COMMODITIES) {
      const data = await fetchCommodity(symbol as keyof typeof COMMODITIES);
      if (!data) {
        return NextResponse.json({ error: `Failed to fetch ${symbol}` }, { status: 500 });
      }
      return NextResponse.json({ success: true, commodity: data });
    }

    // Fetch commodities sequentially with longer delays
    const symbols = Object.keys(COMMODITIES) as (keyof typeof COMMODITIES)[];
    const results: (CommodityData | null)[] = [];
    
    console.log(`[Commodities] Starting fetch for ${symbols.length} commodities...`);
    
    for (let i = 0; i < symbols.length; i++) {
      const s = symbols[i];
      const data = await fetchCommodity(s);
      results.push(data);
      // Add 500ms delay between requests (except after last)
      if (i < symbols.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    const commodities = results.filter((r): r is CommodityData => r !== null);
    
    console.log(`[Commodities] Fetched ${commodities.length}/${symbols.length} successfully`);
    
    // If zero commodities, return error
    if (commodities.length === 0) {
      return NextResponse.json({ 
        error: 'Failed to fetch commodity data. Please try again.',
        success: false 
      }, { status: 500 });
    }
    
    // Group by category
    const byCategory = {
      Energy: commodities.filter(c => c.category === 'Energy'),
      Metals: commodities.filter(c => c.category === 'Metals'),
      Agriculture: commodities.filter(c => c.category === 'Agriculture'),
    };

    // Calculate summary stats
    const summary = {
      totalCommodities: commodities.length,
      gainers: commodities.filter(c => c.changePercent > 0).length,
      losers: commodities.filter(c => c.changePercent < 0).length,
      avgChange: commodities.length > 0 
        ? commodities.reduce((sum, c) => sum + c.changePercent, 0) / commodities.length 
        : 0,
      topGainer: commodities.length > 0 
        ? commodities.reduce((max, c) => c.changePercent > max.changePercent ? c : max)
        : null,
      topLoser: commodities.length > 0 
        ? commodities.reduce((min, c) => c.changePercent < min.changePercent ? c : min)
        : null,
    };

    return NextResponse.json({
      success: true,
      commodities,
      byCategory,
      summary,
      lastUpdate: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Commodities API error:', err);
    return NextResponse.json({ error: 'Failed to fetch commodity data' }, { status: 500 });
  }
}
