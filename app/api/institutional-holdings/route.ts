import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { avTakeToken } from '@/lib/avRateGovernor';

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';

// Cache per symbol, 6 hour TTL (institutional data is quarterly)
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
    const url = `https://www.alphavantage.co/query?function=INSTITUTIONAL_HOLDINGS&symbol=${encodeURIComponent(symbol)}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ error: `AV API error: ${res.status}` }, { status: 502 });
    }

    const json = await res.json();
    if (json['Error Message'] || json['Note']) {
      return NextResponse.json({ error: json['Error Message'] || 'Rate limited' }, { status: 429 });
    }

    // Parse institutional holdings
    const rawHoldings = json['data'] || [];
    const holdings = rawHoldings.slice(0, 30).map((h: any) => ({
      investor: h['investor'] || h['investorName'] || '',
      sharesHeld: parseInt(h['shares'] || h['current_shares'] || '0') || 0,
      sharesChange: parseInt(h['change'] || h['share_change'] || '0') || 0,
      changePercent: parseFloat(h['change_percentage'] || h['change_percent'] || '0') || 0,
      value: parseFloat(h['value'] || '0') || 0,
      reportDate: h['date'] || h['report_date'] || '',
    }));

    // Summary stats
    const totalShares = holdings.reduce((sum: number, h: any) => sum + h.sharesHeld, 0);
    const totalValue = holdings.reduce((sum: number, h: any) => sum + h.value, 0);
    const netBuyers = holdings.filter((h: any) => h.sharesChange > 0).length;
    const netSellers = holdings.filter((h: any) => h.sharesChange < 0).length;

    const result = {
      symbol,
      holders: holdings,
      summary: {
        totalInstitutionalHolders: holdings.length,
        totalSharesHeld: totalShares,
        totalValue,
        netBuyers,
        netSellers,
        sentiment: netBuyers > netSellers ? 'accumulating' : netSellers > netBuyers ? 'distributing' : 'neutral',
      },
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
    console.error('[Institutional Holdings] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch institutional holdings' }, { status: 500 });
  }
}
