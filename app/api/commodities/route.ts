import { NextRequest, NextResponse } from 'next/server';

// Map commodity keys to Alpha Vantage function names
const commodityFunctions: Record<string, string> = {
  WTI: 'WTI', // Crude Oil (WTI)
  BRENT: 'BRENT', // Crude Oil (Brent)
  NATGAS: 'NATURAL_GAS', // Natural Gas
  COPPER: 'COPPER',
  ALUMINUM: 'ALUMINUM',
  WHEAT: 'WHEAT',
  CORN: 'CORN',
  COTTON: 'COTTON',
  SUGAR: 'SUGAR',
  COFFEE: 'COFFEE',
  // GCI: not supported by Alpha Vantage, will show as unavailable
};

const API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const BASE_URL = 'https://www.alphavantage.co/query';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  if (!type || !commodityFunctions[type]) {
    return NextResponse.json({ error: 'Invalid commodity type' }, { status: 400 });
  }


  // Commodities that support daily interval per Alpha Vantage docs
  const dailyCapable = [
    'WTI', 'BRENT', 'NATGAS', 'NATURAL_GAS',
    'COPPER', 'ALUMINUM', 'WHEAT', 'CORN', 'COTTON', 'SUGAR', 'COFFEE'
  ];
  const interval = dailyCapable.includes(type) ? 'daily' : 'monthly';

  const params = new URLSearchParams({
    function: commodityFunctions[type],
    interval,
    apikey: API_KEY || '',
    datatype: 'json',
  });

  try {
    const res = await fetch(`${BASE_URL}?${params.toString()}`);
    const data = await res.json();
    const commodityData = Array.isArray(data.data) ? data.data : [];
    if (commodityData.length === 0) {
      return NextResponse.json({ value: null, date: null });
    }
    // Sort by date descending (ISO format)
    commodityData.sort((a: { date?: string }, b: { date?: string }) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.localeCompare(a.date);
    });
    const latest = commodityData[0];
    return NextResponse.json({
      value: latest.value ? parseFloat(latest.value) : null,
      date: latest.date || null,
    });
  } catch (err) {
    return NextResponse.json({ value: null, date: null });
  }
}
