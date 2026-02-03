import { NextRequest, NextResponse } from 'next/server';

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
      return NextResponse.json(allData);
    }
    
    if (!indicator) {
      return NextResponse.json({ 
        error: 'Indicator required',
        available: Object.keys(INDICATORS),
      }, { status: 400 });
    }
    
    const cacheKey = `${indicator}_${maturity}`;
    const cached = cache.get(cacheKey);
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      return NextResponse.json(cached.data);
    }
    
    let url = `https://www.alphavantage.co/query?function=${indicator}&apikey=${apiKey}`;
    if (indicator === 'TREASURY_YIELD') {
      url += `&maturity=${maturity}`;
    }
    
    const response = await fetch(url);
    const data = await response.json();
    
    const formatted = formatIndicator(indicator, data, maturity);
    cache.set(cacheKey, { data: formatted, timestamp: now });
    
    return NextResponse.json(formatted);
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
  
  // Fetch key indicators in parallel
  const indicatorsToFetch = [
    { func: 'TREASURY_YIELD', maturity: '10year' },
    { func: 'TREASURY_YIELD', maturity: '2year' },
    { func: 'FEDERAL_FUNDS_RATE' },
    { func: 'CPI' },
    { func: 'INFLATION' },
    { func: 'UNEMPLOYMENT' },
    { func: 'REAL_GDP' },
  ];
  
  const results = await Promise.all(
    indicatorsToFetch.map(async (ind) => {
      try {
        let url = `https://www.alphavantage.co/query?function=${ind.func}&apikey=${apiKey}`;
        if (ind.maturity) url += `&maturity=${ind.maturity}`;
        
        const response = await fetch(url);
        const data = await response.json();
        return { indicator: ind.func, maturity: ind.maturity, data };
      } catch (e) {
        return { indicator: ind.func, maturity: ind.maturity, error: true };
      }
    })
  );
  
  // Process results
  const treasury10y = results.find(r => r.indicator === 'TREASURY_YIELD' && r.maturity === '10year');
  const treasury2y = results.find(r => r.indicator === 'TREASURY_YIELD' && r.maturity === '2year');
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
  
  const t10y = getValue(treasury10y);
  const t2y = getValue(treasury2y);
  const yieldCurve = t10y && t2y ? t10y - t2y : null;
  
  const dashboard = {
    timestamp: new Date().toISOString(),
    
    rates: {
      treasury10y: { value: t10y, history: getHistory(treasury10y) },
      treasury2y: { value: t2y, history: getHistory(treasury2y) },
      yieldCurve: { 
        value: yieldCurve ? Math.round(yieldCurve * 100) / 100 : null,
        inverted: yieldCurve !== null && yieldCurve < 0,
        label: yieldCurve !== null ? (yieldCurve < 0 ? '⚠️ Inverted' : 'Normal') : 'N/A',
      },
      fedFunds: { value: getValue(fedFunds), history: getHistory(fedFunds) },
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
  const dataPoints = data.data || [];
  const info = INDICATORS[indicator as keyof typeof INDICATORS] || { name: indicator, category: 'other' };
  
  const latest = dataPoints[0];
  const previous = dataPoints[1];
  const change = latest && previous 
    ? Math.round((parseFloat(latest.value) - parseFloat(previous.value)) * 100) / 100 
    : null;
  
  return {
    timestamp: new Date().toISOString(),
    indicator,
    name: info.name,
    category: info.category,
    unit: data.unit || '%',
    interval: data.interval,
    maturity: maturity || null,
    
    latest: latest ? {
      date: latest.date,
      value: parseFloat(latest.value),
    } : null,
    
    change,
    trend: change !== null ? (change > 0 ? 'rising' : change < 0 ? 'falling' : 'flat') : null,
    
    history: dataPoints.slice(0, 24).map((d: any) => ({
      date: d.date,
      value: parseFloat(d.value),
    })),
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
