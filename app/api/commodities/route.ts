import { NextRequest, NextResponse } from 'next/server';

// Alpha Vantage commodity endpoints
// https://www.alphavantage.co/documentation/#commodities

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';

// Commodity definitions with their AV function names and display info
// NOTE: Energy commodities support daily interval, but base metals and agriculture only support monthly
const COMMODITIES = {
  // Precious Metals (use GOLD_SILVER_HISTORY endpoint - supports daily)
  GOLD: { function: 'GOLD_SILVER_HISTORY', symbol: 'GOLD', name: 'Gold', unit: '$/oz', category: 'Metals', isPreciousMetal: true, supportsDaily: true },
  SILVER: { function: 'GOLD_SILVER_HISTORY', symbol: 'SILVER', name: 'Silver', unit: '$/oz', category: 'Metals', isPreciousMetal: true, supportsDaily: true },
  // Energy (supports daily interval)
  WTI: { function: 'WTI', name: 'WTI Crude Oil', unit: '$/barrel', category: 'Energy', supportsDaily: true },
  BRENT: { function: 'BRENT', name: 'Brent Crude Oil', unit: '$/barrel', category: 'Energy', supportsDaily: true },
  NATURAL_GAS: { function: 'NATURAL_GAS', name: 'Natural Gas', unit: '$/MMBtu', category: 'Energy', supportsDaily: true },
  // Base Metals (only monthly/quarterly/annual)
  COPPER: { function: 'COPPER', name: 'Copper', unit: '$/lb', category: 'Metals', supportsDaily: false },
  ALUMINUM: { function: 'ALUMINUM', name: 'Aluminum', unit: '$/tonne', category: 'Metals', supportsDaily: false },
  // Agriculture (only monthly/quarterly/annual)
  WHEAT: { function: 'WHEAT', name: 'Wheat', unit: '$/bushel', category: 'Agriculture', supportsDaily: false },
  CORN: { function: 'CORN', name: 'Corn', unit: '$/bushel', category: 'Agriculture', supportsDaily: false },
  COTTON: { function: 'COTTON', name: 'Cotton', unit: 'cents/lb', category: 'Agriculture', supportsDaily: false },
  SUGAR: { function: 'SUGAR', name: 'Sugar', unit: 'cents/lb', category: 'Agriculture', supportsDaily: false },
  COFFEE: { function: 'COFFEE', name: 'Coffee', unit: 'cents/lb', category: 'Agriculture', supportsDaily: false },
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
    return cached.data;
  }

  try {
    const config = COMMODITIES[symbol];
    
    // Determine the interval - some commodities only support monthly
    const interval = config.supportsDaily ? 'daily' : 'monthly';
    
    // Different URL format for precious metals (Gold/Silver)
    let url: string;
    if ('isPreciousMetal' in config && config.isPreciousMetal) {
      // Gold and Silver use GOLD_SILVER_HISTORY with symbol parameter
      url = `https://www.alphavantage.co/query?function=GOLD_SILVER_HISTORY&symbol=${config.symbol}&interval=${interval}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    } else {
      // Other commodities use their function directly
      url = `https://www.alphavantage.co/query?function=${config.function}&interval=${interval}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    }
    
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

    // Parse the data array
    const dataPoints = data.data;
    if (!dataPoints || !Array.isArray(dataPoints) || dataPoints.length < 2) {
      console.error(`No data for ${symbol}`);
      return null;
    }

    // Get latest and previous values
    const latest = dataPoints[0];
    const previous = dataPoints[1];
    
    const currentPrice = parseFloat(latest.value);
    const previousPrice = parseFloat(previous.value);
    const change = currentPrice - previousPrice;
    const changePercent = (change / previousPrice) * 100;

    // Get history (30 points for daily, 12 months for monthly)
    const historyLimit = config.supportsDaily ? 30 : 12;
    const history = dataPoints.slice(0, historyLimit).map((d: any) => ({
      date: d.date,
      value: parseFloat(d.value)
    }));

    const result: CommodityData = {
      symbol,
      name: config.name,
      price: currentPrice,
      change,
      changePercent,
      unit: config.unit,
      category: config.category,
      date: latest.date,
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

    // Fetch commodities sequentially to avoid rate limiting
    // Alpha Vantage Premium allows 75 calls/min, but parallel calls can still hit limits
    const symbols = Object.keys(COMMODITIES) as (keyof typeof COMMODITIES)[];
    const results: (CommodityData | null)[] = [];
    
    for (const s of symbols) {
      const data = await fetchCommodity(s);
      results.push(data);
      // Add small delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    const commodities = results.filter((r): r is CommodityData => r !== null);
    
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
