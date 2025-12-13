import { NextRequest, NextResponse } from 'next/server';

// Map economic indicator keys to Alpha Vantage function names
const econFunctions: Record<string, string> = {
  REAL_GDP: 'REAL_GDP',
  CPI: 'CPI',
  UNEMPLOYMENT: 'UNEMPLOYMENT',
  INFLATION: 'INFLATION',
  RETAIL_SALES: 'RETAIL_SALES',
  TREASURY_YIELD: 'TREASURY_YIELD',
};

const API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const BASE_URL = 'https://www.alphavantage.co/query';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  if (!type || !econFunctions[type]) {
    return NextResponse.json({ error: 'Invalid economic indicator' }, { status: 400 });
  }

  const params = new URLSearchParams({
    function: econFunctions[type],
    interval: 'monthly',
    apikey: API_KEY || '',
    datatype: 'json',
  });

  try {
    const res = await fetch(`${BASE_URL}?${params.toString()}`);
    const data = await res.json();
    const econData = data.data || [];
    if (econData.length === 0) {
      return NextResponse.json({ value: null, date: null });
    }
    // Get the latest value
    const latest = econData[0];
    return NextResponse.json({
      value: latest.value ? parseFloat(latest.value) : null,
      date: latest.date || null,
    });
  } catch (err) {
    return NextResponse.json({ value: null, date: null });
  }
}
