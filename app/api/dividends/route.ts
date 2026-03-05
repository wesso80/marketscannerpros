import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { avTakeToken } from '@/lib/avRateGovernor';

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';

// Cache per symbol, 6 hour TTL
const cache: Map<string, { data: any; timestamp: number }> = new Map();
const CACHE_TTL = 6 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol')?.toUpperCase();

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
  }

  // Check cache
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json({ success: true, ...cached.data, cached: true });
  }

  try {
    await avTakeToken();
    const url = `https://www.alphavantage.co/query?function=DIVIDENDS&symbol=${encodeURIComponent(symbol)}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ error: `AV API error: ${res.status}` }, { status: 502 });
    }

    const json = await res.json();
    if (json['Error Message'] || json['Note']) {
      return NextResponse.json({ error: json['Error Message'] || 'Rate limited' }, { status: 429 });
    }

    const rawDividends = json['data'] || [];
    const dividends = rawDividends.map((d: any) => ({
      exDividendDate: d['ex_dividend_date'] || '',
      declarationDate: d['declaration_date'] || '',
      recordDate: d['record_date'] || '',
      paymentDate: d['payment_date'] || '',
      amount: parseFloat(d['amount']) || 0,
      adjustedAmount: parseFloat(d['adjusted_amount']) || 0,
    }));

    // Calculate derived stats
    const recentAnnual = dividends.slice(0, 4); // Last 4 quarters
    const annualDividend = recentAnnual.reduce((sum: number, d: any) => sum + d.amount, 0);
    const dividendGrowth = dividends.length >= 8
      ? (() => {
          const prev4 = dividends.slice(4, 8).reduce((s: number, d: any) => s + d.amount, 0);
          return prev4 > 0 ? ((annualDividend - prev4) / prev4) * 100 : 0;
        })()
      : null;

    // Future (declared but not yet ex-date)
    const today = new Date().toISOString().split('T')[0];
    const futureDividends = dividends.filter((d: any) => d.exDividendDate > today);

    const result = {
      symbol,
      dividends: dividends.slice(0, 20), // Last 20 entries
      annualDividend,
      dividendGrowthYoY: dividendGrowth,
      futureDividends,
      totalHistory: dividends.length,
      lastUpdate: new Date().toISOString(),
    };

    cache.set(symbol, { data: result, timestamp: Date.now() });

    // Evict old entries
    if (cache.size > 200) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
      for (let i = 0; i < 50; i++) cache.delete(oldest[i][0]);
    }

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('[Dividends] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch dividend data' }, { status: 500 });
  }
}
