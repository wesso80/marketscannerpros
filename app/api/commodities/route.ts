import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { avTakeToken } from '@/lib/avRateGovernor';
import { deepAnalysisLimiter, getClientIP } from '@/lib/rateLimit';

// Alpha Vantage commodity endpoints
// https://www.alphavantage.co/documentation/#commodities
//
// IMPORTANT: AV's WTI / NATURAL_GAS / COPPER / WHEAT endpoints return
// EIA/USDA historical data that is 1-30+ days delayed.
// For near-real-time pricing we use GLOBAL_QUOTE on commodity-tracking ETFs
// as the *primary* source and fall back to the legacy endpoint only when
// the ETF quote is unavailable.

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';

// ETF proxies for real-time commodity prices
// These trade in real-time and closely track the underlying commodity
const ETF_PROXIES: Record<string, { etf: string; multiplier: number; description: string }> = {
  WTI:         { etf: 'USO',  multiplier: 1,   description: 'United States Oil Fund' },
  BRENT:       { etf: 'BNO',  multiplier: 1,   description: 'United States Brent Oil Fund' },
  NATURAL_GAS: { etf: 'UNG',  multiplier: 1,   description: 'United States Natural Gas Fund' },
  COPPER:      { etf: 'CPER', multiplier: 1,   description: 'United States Copper Index Fund' },
  WHEAT:       { etf: 'WEAT', multiplier: 1,   description: 'Teucrium Wheat Fund' },
  CORN:        { etf: 'CORN', multiplier: 1,   description: 'Teucrium Corn Fund' },
  SUGAR:       { etf: 'CANE', multiplier: 1,   description: 'Teucrium Sugar Fund' },
  COFFEE:      { etf: 'JO',   multiplier: 1,   description: 'iPath Series B Bloomberg Coffee ETN' },
};

// Core commodities config (legacy endpoints used as fallback only)
const COMMODITIES = {
  WTI: { function: 'WTI', name: 'WTI Crude Oil', unit: '$/barrel', category: 'Energy', interval: 'daily' },
  BRENT: { function: 'BRENT', name: 'Brent Crude Oil', unit: '$/barrel', category: 'Energy', interval: 'daily' },
  NATURAL_GAS: { function: 'NATURAL_GAS', name: 'Natural Gas', unit: '$/MMBtu', category: 'Energy', interval: 'daily' },
  GOLD: { function: 'GOLD_SILVER_SPOT', symbol: 'GOLD', name: 'Gold', unit: '$/oz', category: 'Metals', isPreciousMetal: true },
  SILVER: { function: 'GOLD_SILVER_SPOT', symbol: 'SILVER', name: 'Silver', unit: '$/oz', category: 'Metals', isPreciousMetal: true },
  COPPER: { function: 'COPPER', name: 'Copper', unit: '$/lb', category: 'Metals', interval: 'monthly' },
  ALUMINUM: { function: 'ALUMINUM', name: 'Aluminum', unit: '$/metric ton', category: 'Metals', interval: 'monthly' },
  WHEAT: { function: 'WHEAT', name: 'Wheat', unit: '$/bushel', category: 'Agriculture', interval: 'monthly' },
  CORN: { function: 'CORN', name: 'Corn', unit: '$/bushel', category: 'Agriculture', interval: 'monthly' },
  COTTON: { function: 'COTTON', name: 'Cotton', unit: '$/lb', category: 'Agriculture', interval: 'monthly' },
  SUGAR: { function: 'SUGAR', name: 'Sugar', unit: '$/lb', category: 'Agriculture', interval: 'monthly' },
  COFFEE: { function: 'COFFEE', name: 'Coffee', unit: '$/lb', category: 'Agriculture', interval: 'monthly' },
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

async function fetchETFQuote(etfSymbol: string): Promise<{ price: number; change: number; changePercent: number; date: string } | null> {
  try {
    await avTakeToken();
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${etfSymbol}&entitlement=realtime&apikey=${ALPHA_VANTAGE_API_KEY}`;
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const json = await res.json();
    const quote = json['Global Quote'] || json['Global Quote - DATA DELAYED BY 15 MINUTES'];
    if (!quote || !quote['05. price']) return null;
    return {
      price: parseFloat(quote['05. price']),
      change: parseFloat(quote['09. change'] || '0'),
      changePercent: parseFloat((quote['10. change percent'] || '0').replace('%', '')),
      date: quote['07. latest trading day'] || new Date().toISOString().split('T')[0],
    };
  } catch (err) {
    console.error(`[Commodities] ETF quote failed for ${etfSymbol}:`, err);
    return null;
  }
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

    // ── Strategy 1: ETF proxy via GLOBAL_QUOTE (real-time) ──
    const proxy = ETF_PROXIES[symbol];
    if (proxy) {
      console.log(`[Commodities] Trying real-time ETF proxy ${proxy.etf} for ${symbol}...`);
      const etfQuote = await fetchETFQuote(proxy.etf);
      if (etfQuote && etfQuote.price > 0) {
        console.log(`[Commodities] ✓ ETF proxy ${proxy.etf} → $${etfQuote.price} (${etfQuote.changePercent}%)`);
        const result: CommodityData = {
          symbol,
          name: config.name,
          price: etfQuote.price,
          change: etfQuote.change,
          changePercent: etfQuote.changePercent,
          unit: config.unit,
          category: config.category,
          date: etfQuote.date,
          history: [{ date: etfQuote.date, value: etfQuote.price }],
        };
        cache.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;
      }
      console.log(`[Commodities] ETF proxy ${proxy.etf} unavailable, falling back to legacy endpoint`);
    }

    // ── Strategy 2: GOLD_SILVER_SPOT or legacy commodity endpoint ──
    let url: string;
    if ('isPreciousMetal' in config && config.isPreciousMetal) {
      url = `https://www.alphavantage.co/query?function=GOLD_SILVER_SPOT&symbol=${config.symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    } else {
      const interval = 'interval' in config ? config.interval : 'monthly';
      url = `https://www.alphavantage.co/query?function=${config.function}&interval=${interval}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    }
    
    console.log(`[Commodities] Fetching ${symbol} via legacy endpoint...`);
    
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
  // Auth guard: AV license requires authenticated users only
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Please log in to access commodity data' }, { status: 401 });
  }

  // Rate limit: expensive endpoint (up to 6 AV calls)
  const ip = getClientIP(req);
  const rateCheck = deepAnalysisLimiter.check(ip);
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

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
