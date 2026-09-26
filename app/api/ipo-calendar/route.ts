import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { avTakeToken } from '@/lib/avRateGovernor';
import { parseCsvTable } from '@/lib/csv';

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';

// Cache: 6 hours (IPO lists update infrequently)
let ipoCache: { data: any; timestamp: number } | null = null;
const CACHE_TTL = 6 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check cache
  if (ipoCache && Date.now() - ipoCache.timestamp < CACHE_TTL) {
    return NextResponse.json({ success: true, ...ipoCache.data, cached: true });
  }

  try {
    await avTakeToken();
    const url = `https://www.alphavantage.co/query?function=IPO_CALENDAR&apikey=${ALPHA_VANTAGE_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ error: `AV API error: ${res.status}` }, { status: 502 });
    }

    const csvText = await res.text();

    // Check for API errors
    if (csvText.includes('Error Message') || csvText.includes('Invalid API call')) {
      return NextResponse.json({ error: 'API error or rate limited' }, { status: 429 });
    }

    // Parse CSV: symbol, name, ipoDate, priceRangeLow, priceRangeHigh, currency, exchange.
    // Quote-aware (company names can contain commas) and read by header name, not position.
    const table = parseCsvTable(csvText);
    if (table.rows.length < 1 || table.col('symbol') < 0 || table.col('ipoDate') < 0) {
      return NextResponse.json({ success: true, ipos: [], count: 0 });
    }

    const num = (v: string) => { const n = v === '' ? NaN : Number(v); return Number.isFinite(n) ? n : null; };
    const ipos = table.rows.map((row) => ({
      symbol: table.get(row, 'symbol'),
      name: table.get(row, 'name'),
      ipoDate: table.get(row, 'ipoDate'),
      priceRangeLow: num(table.get(row, 'priceRangeLow')),
      priceRangeHigh: num(table.get(row, 'priceRangeHigh')),
      currency: table.get(row, 'currency') || 'USD',
      exchange: table.get(row, 'exchange'),
    })).filter(ipo => ipo.symbol && ipo.ipoDate);

    // Sort by date ascending
    ipos.sort((a, b) => a.ipoDate.localeCompare(b.ipoDate));

    // Group by timeframe
    const today = new Date().toISOString().split('T')[0];
    const thisWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    const thisMonth = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    const upcoming = ipos.filter(i => i.ipoDate >= today);
    const thisWeekIPOs = upcoming.filter(i => i.ipoDate <= thisWeek);
    const thisMonthIPOs = upcoming.filter(i => i.ipoDate <= thisMonth);

    const result = {
      ipos,
      count: ipos.length,
      upcoming: upcoming.length,
      thisWeek: thisWeekIPOs.length,
      thisMonth: thisMonthIPOs.length,
      lastUpdate: new Date().toISOString(),
    };

    ipoCache = { data: result, timestamp: Date.now() };

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('[IPO Calendar] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch IPO calendar' }, { status: 500 });
  }
}
