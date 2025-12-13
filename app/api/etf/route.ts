import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const BASE_URL = 'https://www.alphavantage.co/query';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol');
  if (!symbol) {
    return NextResponse.json({ error: 'Missing ETF symbol' }, { status: 400 });
  }

  // Fetch ETF profile
  const params = new URLSearchParams({
    function: 'ETF_PROFILE',
    symbol,
    apikey: API_KEY || '',
    datatype: 'json',
  });

  try {
    const res = await fetch(`${BASE_URL}?${params.toString()}`);
    const data = await res.json();
    if (!data || data.Note || data.Information) {
      return NextResponse.json({ error: 'ETF not found or API error' }, { status: 404 });
    }
    // Optionally fetch holdings if available
    let holdings = [];
    if (data.holdings && Array.isArray(data.holdings)) {
      holdings = data.holdings.map((h: any) => ({
        name: h.name || '',
        symbol: h.symbol || '',
        weight: h.weight ? parseFloat(h.weight) : 0,
      }));
    }
    return NextResponse.json({
      name: data.name || symbol,
      symbol: data.symbol || symbol,
      description: data.description || '',
      holdings,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch ETF profile' }, { status: 500 });
  }
}
