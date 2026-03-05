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
    const url = `https://www.alphavantage.co/query?function=EARNINGS_ESTIMATES&symbol=${encodeURIComponent(symbol)}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ error: `AV API error: ${res.status}` }, { status: 502 });
    }

    const json = await res.json();
    if (json['Error Message'] || json['Note']) {
      return NextResponse.json({ error: json['Error Message'] || 'Rate limited' }, { status: 429 });
    }

    // Parse quarterly estimates
    const quarterlyEstimates = (json['quarterlyEstimates'] || []).map((q: any) => ({
      fiscalDateEnding: q['fiscalDateEnding'] || '',
      date: q['date'] || '',
      estimatedEPS: q['estimatedEPS'] !== 'None' ? parseFloat(q['estimatedEPS']) : null,
      estimatedRevenue: q['estimatedRevenue'] !== 'None' ? parseFloat(q['estimatedRevenue']) : null,
      numberOfAnalysts: parseInt(q['numberOfAnalysts'] || '0') || 0,
      estimateLow: q['estimateLow'] !== 'None' ? parseFloat(q['estimateLow']) : null,
      estimateHigh: q['estimateHigh'] !== 'None' ? parseFloat(q['estimateHigh']) : null,
      revenueEstimateLow: q['revenueEstimateLow'] !== 'None' ? parseFloat(q['revenueEstimateLow']) : null,
      revenueEstimateHigh: q['revenueEstimateHigh'] !== 'None' ? parseFloat(q['revenueEstimateHigh']) : null,
    }));

    // Parse annual estimates
    const annualEstimates = (json['annualEstimates'] || []).map((a: any) => ({
      fiscalDateEnding: a['fiscalDateEnding'] || '',
      estimatedEPS: a['estimatedEPS'] !== 'None' ? parseFloat(a['estimatedEPS']) : null,
      estimatedRevenue: a['estimatedRevenue'] !== 'None' ? parseFloat(a['estimatedRevenue']) : null,
      numberOfAnalysts: parseInt(a['numberOfAnalysts'] || '0') || 0,
    }));

    // Calculate revision trends
    const nextQuarter = quarterlyEstimates[0];
    const currentYear = annualEstimates[0];

    const result = {
      symbol,
      quarterlyEstimates: quarterlyEstimates.slice(0, 8),
      annualEstimates: annualEstimates.slice(0, 4),
      nextQuarter: nextQuarter || null,
      currentYearEstimate: currentYear || null,
      lastUpdate: new Date().toISOString(),
    };

    cache.set(symbol, { data: result, timestamp: Date.now() });

    // Evict old
    if (cache.size > 200) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
      for (let i = 0; i < 50; i++) cache.delete(oldest[i][0]);
    }

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('[Earnings Estimates] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch earnings estimates' }, { status: 500 });
  }
}
