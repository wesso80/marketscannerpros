import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { avTakeToken } from '@/lib/avRateGovernor';
import { parseAlphaVantageEarningsCalendar } from '@/lib/earningsCalendarCsv';

// Cache for 1 hour (earnings data doesn't change frequently)
let calendarCache: { data: any; timestamp: number } | null = null;
const symbolCache = new Map<string, { data: any; timestamp: number }>();
const CALENDAR_CACHE_DURATION = 60 * 60 * 1000; // 1 hour
const SYMBOL_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

export async function GET(req: NextRequest) {
  // Auth guard: AV license requires authenticated users only
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Please log in to access market data' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get('symbol');
    const type = searchParams.get('type') || 'calendar'; // calendar, history, estimates
    
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }
    
    const now = Date.now();
    
    if (type === 'calendar') {
      // Return earnings calendar (upcoming earnings)
      if (calendarCache && (now - calendarCache.timestamp) < CALENDAR_CACHE_DURATION) {
        return NextResponse.json(calendarCache.data);
      }
      
await avTakeToken();
    const response = await fetch(
        `https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&horizon=3month&apikey=${apiKey}`
      );
      
      if (!response.ok) {
        throw new Error(`Alpha Vantage API error: ${response.status}`);
      }
      
      // This returns CSV data
      const csvText = await response.text();
      const data = parseEarningsCSV(csvText);
      
      calendarCache = { data, timestamp: now };
      return NextResponse.json(data);
    }
    
    if (!symbol) {
      return NextResponse.json({ error: 'Symbol required for history/estimates' }, { status: 400 });
    }
    
    const cacheKey = `${symbol}_${type}`;
    const cached = symbolCache.get(cacheKey);
    if (cached && (now - cached.timestamp) < SYMBOL_CACHE_DURATION) {
      return NextResponse.json(cached.data);
    }
    
    if (type === 'history') {
      // Historical earnings
      await avTakeToken();
      const response = await fetch(
        `https://www.alphavantage.co/query?function=EARNINGS&symbol=${symbol}&apikey=${apiKey}`
      );
      
      const data = await response.json();
      const formatted = formatEarningsHistory(data, symbol);
      symbolCache.set(cacheKey, { data: formatted, timestamp: now });
      return NextResponse.json(formatted);
    }
    
    if (type === 'estimates') {
      // Earnings estimates (analyst consensus)
      // Note: This might require a different endpoint or premium
      await avTakeToken();
      const response = await fetch(
        `https://www.alphavantage.co/query?function=EARNINGS&symbol=${symbol}&apikey=${apiKey}`
      );
      
      const data = await response.json();
      const formatted = formatEarningsEstimates(data, symbol);
      symbolCache.set(cacheKey, { data: formatted, timestamp: now });
      return NextResponse.json(formatted);
    }
    
    return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
  } catch (error) {
    console.error('Earnings API error:', error);
    return NextResponse.json({ error: 'Failed to fetch earnings data' }, { status: 500 });
  }
}

function parseEarningsCSV(csv: string) {
  // Quote-aware: names like "FLAGSTAR BANK, N.A." keep their date. Unreadable dates are skipped and logged.
  const parsed = parseAlphaVantageEarningsCalendar(csv, { source: '/api/earnings' });
  if (!parsed.rows.length) {
    return { earnings: [], upcoming: [], thisWeek: [], nextWeek: [] };
  }
  const earnings: any[] = parsed.rows.map((r) => ({
    symbol: r.symbol,
    name: r.name,
    reportDate: r.reportDate,
    fiscalDateEnding: r.fiscalDateEnding,
    estimate: r.estimate,
    currency: r.currency || 'USD',
  }));
  
  // Sort by date
  earnings.sort((a, b) => new Date(a.reportDate).getTime() - new Date(b.reportDate).getTime());
  
  // Categorize by timeframe
  const now = new Date();
  const endOfWeek = new Date(now);
  endOfWeek.setDate(now.getDate() + (7 - now.getDay()));
  
  const endOfNextWeek = new Date(endOfWeek);
  endOfNextWeek.setDate(endOfNextWeek.getDate() + 7);
  
  const upcoming = earnings.filter(e => new Date(e.reportDate) >= now);
  const thisWeek = upcoming.filter(e => new Date(e.reportDate) <= endOfWeek);
  const nextWeek = upcoming.filter(e => {
    const date = new Date(e.reportDate);
    return date > endOfWeek && date <= endOfNextWeek;
  });
  
  // Popular tickers to highlight
  const popularTickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'AMD', 'NFLX', 'SPY', 'QQQ'];
  const majorEarnings = upcoming.filter(e => popularTickers.includes(e.symbol)).slice(0, 20);
  
  return {
    timestamp: new Date().toISOString(),
    totalUpcoming: upcoming.length,
    thisWeek,
    nextWeek,
    majorEarnings,
    allUpcoming: upcoming.slice(0, 200), // Limit for response size
  };
}

function formatEarningsHistory(data: any, symbol: string) {
  const annual = data.annualEarnings || [];
  const quarterly = data.quarterlyEarnings || [];
  
  // Calculate beat/miss history
  const beatHistory = quarterly.slice(0, 8).map((q: any) => {
    const reported = parseFloat(q.reportedEPS);
    const estimated = parseFloat(q.estimatedEPS);
    const surprise = reported - estimated;
    const surprisePercent = estimated !== 0 ? (surprise / Math.abs(estimated)) * 100 : 0;
    
    return {
      fiscalDate: q.fiscalDateEnding,
      reportedDate: q.reportedDate,
      reportedEPS: reported,
      estimatedEPS: estimated,
      surprise: Math.round(surprise * 100) / 100,
      surprisePercent: Math.round(surprisePercent * 10) / 10,
      beat: surprise > 0,
      miss: surprise < 0,
    };
  });
  
  const beatsCount = beatHistory.filter((b: any) => b.beat).length;
  const missCount = beatHistory.filter((b: any) => b.miss).length;
  
  return {
    timestamp: new Date().toISOString(),
    symbol,
    beatRate: beatHistory.length > 0 ? Math.round((beatsCount / beatHistory.length) * 100) : null,
    beatsCount,
    missCount,
    quarterlyHistory: beatHistory,
    annualEarnings: annual.slice(0, 5).map((a: any) => ({
      fiscalYear: a.fiscalDateEnding?.split('-')[0],
      eps: parseFloat(a.reportedEPS),
    })),
  };
}

function formatEarningsEstimates(data: any, symbol: string) {
  const quarterly = data.quarterlyEarnings || [];
  
  // Next earnings estimate (most recent quarter without reported EPS or future date)
  const now = new Date();
  const upcoming = quarterly.find((q: any) => {
    const reportDate = new Date(q.reportedDate || q.fiscalDateEnding);
    return reportDate >= now || !q.reportedEPS;
  });
  
  // Calculate average surprise
  const recentQuarters = quarterly.slice(0, 4);
  const avgSurprise = recentQuarters.reduce((sum: number, q: any) => {
    const reported = parseFloat(q.reportedEPS) || 0;
    const estimated = parseFloat(q.estimatedEPS) || 0;
    return sum + (reported - estimated);
  }, 0) / (recentQuarters.length || 1);
  
  return {
    timestamp: new Date().toISOString(),
    symbol,
    nextEarnings: upcoming ? {
      fiscalDate: upcoming.fiscalDateEnding,
      estimatedEPS: parseFloat(upcoming.estimatedEPS) || null,
    } : null,
    averageSurprise: Math.round(avgSurprise * 100) / 100,
    trend: avgSurprise > 0 ? 'beats' : avgSurprise < 0 ? 'misses' : 'in-line',
  };
}
