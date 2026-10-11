import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { isAvRateInterval } from '@/lib/macro/avRateSeries';
import { FRED_PUBLIC_SOURCE, isPublicFredIndicator, loadPublicFredMacro, readPublicFredIndicator, type PublicSeriesReading } from '@/lib/macro/publicFred';

// Cache for 1 hour (economic data updates infrequently)
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 60 * 60 * 1000;

const PUBLIC_INDICATORS = ['TREASURY_YIELD', 'FEDERAL_FUNDS_RATE', 'CPI', 'INFLATION', 'UNEMPLOYMENT', 'REAL_GDP'];

export async function GET(req: NextRequest) {
  // Session check stays. The series on this route are FRED observations.
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Please log in to access market data' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const indicator = searchParams.get('indicator');
    const maturity = searchParams.get('maturity') || '10year'; // For treasury yields
    const all = searchParams.get('all') === 'true';
    
    const now = Date.now();
    const cacheHeaders = { 'Cache-Control': 'private, max-age=1800, stale-while-revalidate=3600' };

    // Yields, CPI, inflation, fed funds, unemployment, and real GDP growth all come from FRED.
    if (all) {
      const allData = await fetchAllIndicators(now);
      return NextResponse.json(allData, { headers: cacheHeaders });
    }

    if (!isPublicFredIndicator(indicator)) {
      return NextResponse.json({
        error: 'Indicator required',
        available: PUBLIC_INDICATORS,
      }, { status: 400 });
    }

    const intervalParam = searchParams.get('interval');
    const interval = indicator === 'TREASURY_YIELD' || indicator === 'FEDERAL_FUNDS_RATE'
      ? (isAvRateInterval(intervalParam) ? intervalParam : 'daily')
      : null;
    const cacheKey = `${indicator}_${maturity}_${interval ?? ''}`;
    const cached = cache.get(cacheKey);
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      return NextResponse.json(cached.data, { headers: cacheHeaders });
    }
    const formatted = await readPublicFredIndicator(indicator, { maturity, interval, nowMs: now });
    cache.set(cacheKey, { data: formatted, timestamp: now });
    return NextResponse.json(formatted, { headers: cacheHeaders });
  } catch (error) {
    console.error('Economic indicators error:', error);
    return NextResponse.json({ error: 'Failed to fetch economic data' }, { status: 500 });
  }
}

const emptyReading = (): PublicSeriesReading => ({ value: null, date: null, history: [] });

async function fetchAllIndicators(now: number) {
  // Check if we have a fresh "all" cache
  const allCached = cache.get('ALL_INDICATORS');
  if (allCached && (now - allCached.timestamp) < CACHE_DURATION) {
    return allCached.data;
  }

  const fred = await loadPublicFredMacro(now).catch((e: unknown) => {
    console.error('[economic-indicators] FRED macro read failed:', e instanceof Error ? e.message : e);
    return null;
  });

  const r10y = fred?.yields.treasury10y ?? emptyReading();
  const r2y = fred?.yields.treasury2y ?? emptyReading();
  const r3m = fred?.yields.treasury3m ?? emptyReading();
  const r5y = fred?.yields.treasury5y ?? emptyReading();
  const r30y = fred?.yields.treasury30y ?? emptyReading();
  const rFed = fred?.fedFunds ?? emptyReading();
  const unemployment = fred?.unemployment ?? emptyReading();
  const t10y = r10y.value;
  const t2y = r2y.value;
  const t3m = r3m.value;
  const t5y = r5y.value;
  const t30y = r30y.value;
  const yieldCurve = t10y && t2y ? t10y - t2y : null;
  const yieldCurve3m10y = t10y && t3m ? t10y - t3m : null;
  
  const cpi = fred?.cpi ?? emptyReading();
  const inflationRate = fred?.inflationRate ?? emptyReading();
  const dashboard = {
    timestamp: new Date(now).toISOString(),
    source: FRED_PUBLIC_SOURCE,
    asOf: fred?.asOf ?? null,
    
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
      cpi,
      inflationRate,
      trend: (inflationRate.value ?? 0) > 3 ? 'elevated' : 'moderate',
    },
    
    employment: {
      unemployment,
      trend: (unemployment.value ?? 0) < 4 ? 'tight' : 'loosening',
    },
    
    growth: {
      realGDP: {
        ...(fred?.realGdp ?? emptyReading()),
        unit: '%',
      },
    },
    
    // Market regime assessment
    regime: determineRegime(t10y, yieldCurve, inflationRate.value, unemployment.value),
  };
  
  cache.set('ALL_INDICATORS', { data: dashboard, timestamp: now });
  
  return dashboard;
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
