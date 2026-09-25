import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { avTakeToken } from '@/lib/avRateGovernor';
import { isAvRateInterval, latestObservation, monthlyAverages, numericObservations } from '@/lib/macro/avRateSeries';

// Cache for 1 hour (economic data updates infrequently)
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 60 * 60 * 1000;

const INDICATORS = {
  // Interest Rates
  TREASURY_YIELD: { name: 'Treasury Yields', category: 'rates' },
  FEDERAL_FUNDS_RATE: { name: 'Federal Funds Rate', category: 'rates' },
  
  // Growth & Output
  REAL_GDP: { name: 'Real GDP', category: 'growth' },
  REAL_GDP_PER_CAPITA: { name: 'GDP Per Capita', category: 'growth' },
  
  // Inflation
  CPI: { name: 'Consumer Price Index', category: 'inflation' },
  INFLATION: { name: 'Inflation Rate', category: 'inflation' },
  
  // Employment
  UNEMPLOYMENT: { name: 'Unemployment Rate', category: 'employment' },
  NONFARM_PAYROLL: { name: 'Nonfarm Payroll', category: 'employment' },
  
  // Consumer
  RETAIL_SALES: { name: 'Retail Sales', category: 'consumer' },
  DURABLES: { name: 'Durable Goods Orders', category: 'consumer' },
};

export async function GET(req: NextRequest) {
  // Auth guard: AV license requires authenticated users only
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Please log in to access market data' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const indicator = searchParams.get('indicator');
    const maturity = searchParams.get('maturity') || '10year'; // For treasury yields
    const all = searchParams.get('all') === 'true';
    
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }
    
    const now = Date.now();
    
    // Fetch all indicators for dashboard
    if (all) {
      const allData = await fetchAllIndicators(apiKey, now);
      return NextResponse.json(allData, {
        headers: { 'Cache-Control': 'private, max-age=1800, stale-while-revalidate=3600' },
      });
    }
    
    if (!indicator) {
      return NextResponse.json({ 
        error: 'Indicator required',
        available: Object.keys(INDICATORS),
      }, { status: 400 });
    }
    
    // Rate series default to monthly at Alpha Vantage (latest = last month's average); use daily unless asked.
    const isRateSeries = indicator === 'TREASURY_YIELD' || indicator === 'FEDERAL_FUNDS_RATE';
    const intervalParam = searchParams.get('interval');
    const interval = isRateSeries ? (isAvRateInterval(intervalParam) ? intervalParam : 'daily') : null;

    const cacheKey = `${indicator}_${maturity}_${interval ?? ''}`;
    const cached = cache.get(cacheKey);
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      return NextResponse.json(cached.data, {
        headers: { 'Cache-Control': 'private, max-age=1800, stale-while-revalidate=3600' },
      });
    }
    
    let url = `https://www.alphavantage.co/query?function=${indicator}&apikey=${apiKey}`;
    if (indicator === 'TREASURY_YIELD') {
      url += `&maturity=${maturity}`;
    }
    if (interval) url += `&interval=${interval}`;
    
    await avTakeToken();
    const response = await fetch(url);
    const data = await response.json();
    
    const formatted = formatIndicator(indicator, data, maturity);
    cache.set(cacheKey, { data: formatted, timestamp: now });
    
    return NextResponse.json(formatted, {
      headers: { 'Cache-Control': 'private, max-age=1800, stale-while-revalidate=3600' },
    });
  } catch (error) {
    console.error('Economic indicators error:', error);
    return NextResponse.json({ error: 'Failed to fetch economic data' }, { status: 500 });
  }
}

async function fetchAllIndicators(apiKey: string, now: number) {
  // Check if we have a fresh "all" cache
  const allCached = cache.get('ALL_INDICATORS');
  if (allCached && (now - allCached.timestamp) < CACHE_DURATION) {
    return allCached.data;
  }
  
  // Fetch key indicators sequentially with delays to avoid rate limits
  const indicatorsToFetch: Array<{ func: string; maturity?: string; interval?: string }> = [
    // Rate series: interval=daily (AV defaults to monthly, whose newest row is last month's average).
    { func: 'TREASURY_YIELD', maturity: '10year', interval: 'daily' },
    { func: 'TREASURY_YIELD', maturity: '2year', interval: 'daily' },
    { func: 'TREASURY_YIELD', maturity: '3month', interval: 'daily' },
    { func: 'TREASURY_YIELD', maturity: '5year', interval: 'daily' },
    { func: 'TREASURY_YIELD', maturity: '30year', interval: 'daily' },
    { func: 'FEDERAL_FUNDS_RATE', interval: 'daily' },
    { func: 'CPI' },
    { func: 'INFLATION' },
    { func: 'UNEMPLOYMENT' },
    { func: 'REAL_GDP' },
  ];
  
  const results: any[] = [];
  
  for (const ind of indicatorsToFetch) {
    try {
      let url = `https://www.alphavantage.co/query?function=${ind.func}&apikey=${apiKey}`;
      if (ind.maturity) url += `&maturity=${ind.maturity}`;
      if (ind.interval) url += `&interval=${ind.interval}`;
      
      await avTakeToken();
      const response = await fetch(url);
      const data = await response.json();
      
      // Log for debugging
      if (data.Note || data['Error Message']) {
        console.warn(`Economic indicator ${ind.func} rate limited or error:`, data.Note || data['Error Message']);
      }
      
      results.push({ indicator: ind.func, maturity: ind.maturity, data });
      
      // Wait 250ms between requests to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 250));
    } catch (e) {
      console.error(`Error fetching ${ind.func}:`, e);
      results.push({ indicator: ind.func, maturity: ind.maturity, error: true });
    }
  }
  
  // Process results
  const treasury10y = results.find(r => r.indicator === 'TREASURY_YIELD' && r.maturity === '10year');
  const treasury2y = results.find(r => r.indicator === 'TREASURY_YIELD' && r.maturity === '2year');
  const treasury3m = results.find(r => r.indicator === 'TREASURY_YIELD' && r.maturity === '3month');
  const treasury5y = results.find(r => r.indicator === 'TREASURY_YIELD' && r.maturity === '5year');
  const treasury30y = results.find(r => r.indicator === 'TREASURY_YIELD' && r.maturity === '30year');
  const fedFunds = results.find(r => r.indicator === 'FEDERAL_FUNDS_RATE');
  const cpi = results.find(r => r.indicator === 'CPI');
  const inflation = results.find(r => r.indicator === 'INFLATION');
  const unemployment = results.find(r => r.indicator === 'UNEMPLOYMENT');
  const gdp = results.find(r => r.indicator === 'REAL_GDP');
  
  // Extract latest values
  const getValue = (result: any, key = 'value') => {
    if (!result?.data?.data?.[0]) return null;
    return parseFloat(result.data.data[0][key]);
  };
  
  const getHistory = (result: any, count = 12) => {
    if (!result?.data?.data) return [];
    return result.data.data.slice(0, count).map((d: any) => ({
      date: d.date,
      value: parseFloat(d.value),
    }));
  };
  
  // Daily rate series: latest numeric observation (skips '.' holiday rows) + its date; history stays
  // 12 monthly averages rebuilt from the same daily payload so sparklines/trends keep a monthly shape.
  const rate = (result: any) => {
    const latest = latestObservation(result?.data);
    return {
      value: latest?.value ?? null,
      date: latest?.date ?? null,
      history: monthlyAverages(numericObservations(result?.data), 12, now),
    };
  };
  const r10y = rate(treasury10y), r2y = rate(treasury2y), r3m = rate(treasury3m), r5y = rate(treasury5y), r30y = rate(treasury30y);
  const rFed = rate(fedFunds);
  const t10y = r10y.value;
  const t2y = r2y.value;
  const t3m = r3m.value;
  const t5y = r5y.value;
  const t30y = r30y.value;
  const yieldCurve = t10y && t2y ? t10y - t2y : null;
  const yieldCurve3m10y = t10y && t3m ? t10y - t3m : null;
  
  const dashboard = {
    timestamp: new Date().toISOString(),
    
    rates: {
      treasury3m: r3m,
      treasury2y: r2y,
      treasury5y: r5y,
      treasury10y: r10y,
      treasury30y: r30y,
      yieldCurve: { 
        value: yieldCurve ? Math.round(yieldCurve * 100) / 100 : null,
        inverted: yieldCurve !== null && yieldCurve < 0,
        label: yieldCurve !== null ? (yieldCurve < 0 ? '⚠️ Inverted' : 'Normal') : 'N/A',
      },
      yieldCurve3m10y: {
        value: yieldCurve3m10y ? Math.round(yieldCurve3m10y * 100) / 100 : null,
        inverted: yieldCurve3m10y !== null && yieldCurve3m10y < 0,
        label: yieldCurve3m10y !== null ? (yieldCurve3m10y < 0 ? '⚠️ Inverted' : 'Normal') : 'N/A',
      },
      fedFunds: rFed,
    },
    
    inflation: {
      cpi: { value: getValue(cpi), history: getHistory(cpi) },
      inflationRate: { value: getValue(inflation), history: getHistory(inflation, 24) },
      trend: (getValue(inflation) ?? 0) > 3 ? 'elevated' : 'moderate',
    },
    
    employment: {
      unemployment: { value: getValue(unemployment), history: getHistory(unemployment, 24) },
      trend: (getValue(unemployment) ?? 0) < 4 ? 'tight' : 'loosening',
    },
    
    growth: {
      realGDP: { 
        value: getValue(gdp), 
        history: getHistory(gdp, 8),
        unit: 'billions USD',
      },
    },
    
    // Market regime assessment
    regime: determineRegime(t10y, yieldCurve, getValue(inflation), getValue(unemployment)),
  };
  
  cache.set('ALL_INDICATORS', { data: dashboard, timestamp: now });
  
  return dashboard;
}

function formatIndicator(indicator: string, data: any, maturity?: string) {
  // Numeric rows only, newest first (daily rate series carry '.' on non-trading days).
  const dataPoints = numericObservations(data);
  const info = INDICATORS[indicator as keyof typeof INDICATORS] || { name: indicator, category: 'other' };
  
  const latest = dataPoints[0];
  const previous = dataPoints[1];
  const change = latest && previous 
    ? Math.round((latest.value - previous.value) * 100) / 100 
    : null;
  
  return {
    timestamp: new Date().toISOString(),
    indicator,
    name: info.name,
    category: info.category,
    unit: data.unit || '%',
    interval: data.interval,
    maturity: maturity || null,
    
    latest: latest ? { date: latest.date, value: latest.value } : null,
    
    change,
    trend: change !== null ? (change > 0 ? 'rising' : change < 0 ? 'falling' : 'flat') : null,
    
    history: dataPoints.slice(0, 24),
  };
}

function determineRegime(
  treasury10y: number | null, 
  yieldCurve: number | null, 
  inflation: number | null, 
  unemployment: number | null
): { label: string; description: string; riskLevel: 'low' | 'medium' | 'high' } {
  
  // Default regime
  let regime: { label: string; description: string; riskLevel: 'low' | 'medium' | 'high' } = {
    label: 'Neutral',
    description: 'Mixed economic signals',
    riskLevel: 'medium',
  };
  
  // Check for concerning conditions
  const concerns: string[] = [];
  
  if (yieldCurve !== null && yieldCurve < 0) {
    concerns.push('Inverted yield curve (recession signal)');
  }
  
  if (inflation !== null && inflation > 4) {
    concerns.push('Elevated inflation');
  }
  
  if (treasury10y !== null && treasury10y > 5) {
    concerns.push('High interest rate environment');
  }
  
  if (unemployment !== null && unemployment > 5) {
    concerns.push('Rising unemployment');
  }
  
  // Determine regime based on conditions
  if (concerns.length >= 3) {
    regime = {
      label: '⚠️ Risk-Off',
      description: concerns.join('. '),
      riskLevel: 'high',
    };
  } else if (concerns.length >= 1) {
    regime = {
      label: '⚡ Cautious',
      description: concerns.join('. '),
      riskLevel: 'medium',
    };
  } else if (inflation !== null && inflation < 3 && unemployment !== null && unemployment < 4) {
    regime = {
      label: '🟢 Risk-On',
      description: 'Goldilocks: Low inflation, low unemployment',
      riskLevel: 'low',
    };
  }
  
  return regime;
}
