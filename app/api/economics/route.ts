import { NextRequest, NextResponse } from 'next/server';


// Map economic indicator keys to Alpha Vantage function names and params
const econConfigs: Record<string, { func: string; params?: Record<string, string> }> = {
  REAL_GDP: { func: 'REAL_GDP', params: { interval: 'annual' } }, // or quarterly
  CPI: { func: 'CPI', params: { interval: 'monthly' } },
  UNEMPLOYMENT: { func: 'UNEMPLOYMENT' },
  INFLATION: { func: 'INFLATION' },
  RETAIL_SALES: { func: 'RETAIL_SALES' },
  TREASURY_YIELD: { func: 'TREASURY_YIELD', params: { interval: 'monthly', maturity: '10year' } },
};

const API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const BASE_URL = 'https://www.alphavantage.co/query';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');

  if (!type || !econConfigs[type]) {
    return NextResponse.json({ error: 'Invalid economic indicator' }, { status: 400 });
  }

  const config = econConfigs[type];
  const params = new URLSearchParams({
    function: config.func,
    apikey: API_KEY || '',
    datatype: 'json',
  });
  if (config.params) {
    for (const [k, v] of Object.entries(config.params)) {
      params.set(k, v);
    }
  }

  try {
    const res = await fetch(`${BASE_URL}?${params.toString()}`);
    const data = await res.json();
    let value = null;
    let date = null;

    // Handle different response structures
    if (data && Array.isArray(data.data) && data.data.length > 0) {
      // Standard structure: { data: [ { date, value } ] }
      value = data.data[0].value ? parseFloat(data.data[0].value) : null;
      date = data.data[0].date || null;
    } else if (data && data.data && typeof data.data === 'object') {
      // Sometimes data.data is an object (e.g., time series)
      const entries = Object.entries(data.data);
      if (entries.length > 0) {
        const [d, v] = entries[0];
        const vObj = v as { value?: string | number; date?: string };
        value = vObj.value ? parseFloat(vObj.value as string) : null;
        date = d;
      }
    } else if (data && data['data'] && Array.isArray(data['data'])) {
      // Fallback for array
      const latest = data['data'][0];
      value = latest.value ? parseFloat(latest.value) : null;
      date = latest.date || null;
    } else if (data && data['data']) {
      // Fallback for object
      const first = Object.values(data['data'])[0];
      if (first && typeof first === 'object') {
        const firstObj = first as { value?: string | number; date?: string };
        value = firstObj.value ? parseFloat(firstObj.value as string) : null;
        date = firstObj.date || null;
      }
    }

    return NextResponse.json({ value, date });
  } catch (err) {
    return NextResponse.json({ value: null, date: null });
  }
}
