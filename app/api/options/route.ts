import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { symbol, type, minVolume, minOI, minIV, maxDTE } = body;

    if (!symbol) {
      return NextResponse.json(
        { success: false, error: 'Symbol is required' },
        { status: 400 }
      );
    }

    // Get Alpha Vantage API key
    const apiKey = process.env.ALPHA_VANTAGE_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'Alpha Vantage API key not configured' },
        { status: 500 }
      );
    }

    // Fetch options data from Alpha Vantage
    const url = `https://www.alphavantage.co/query?function=REALTIME_OPTIONS&symbol=${symbol.toUpperCase()}&apikey=${apiKey}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'MarketScannerPros/1.0'
      }
    });

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: `Alpha Vantage API returned ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Check for API errors
    if (data['Error Message']) {
      return NextResponse.json(
        { success: false, error: data['Error Message'] },
        { status: 400 }
      );
    }

    if (data['Note']) {
      return NextResponse.json(
        { success: false, error: data['Note'] },
        { status: 429 }
      );
    }

    if (!data.data || !Array.isArray(data.data)) {
      return NextResponse.json(
        { success: false, error: 'No options data available for this symbol' },
        { status: 404 }
      );
    }

    // Parse and filter options data
    let options = data.data.map((opt: any) => {
      const iv = parseFloat(opt.implied_volatility || 0) * 100;
      const volume = parseInt(opt.volume || 0);
      const openInterest = parseInt(opt.open_interest || 0);
      
      // Calculate days to expiration
      const expDate = new Date(opt.expiration);
      const today = new Date();
      const dte = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      return {
        type: opt.type?.toLowerCase() || 'unknown',
        strike: parseFloat(opt.strike || 0),
        expiration: opt.expiration,
        dte: dte,
        bid: parseFloat(opt.bid || 0),
        ask: parseFloat(opt.ask || 0),
        volume: volume,
        open_interest: openInterest,
        implied_volatility: iv,
        delta: parseFloat(opt.delta || 0),
        gamma: parseFloat(opt.gamma || 0),
        theta: parseFloat(opt.theta || 0),
        vega: parseFloat(opt.vega || 0),
      };
    });

    // Apply filters
    if (type && type !== 'both') {
      options = options.filter((opt: any) => opt.type === type.toLowerCase());
    }

    if (minVolume) {
      options = options.filter((opt: any) => opt.volume >= minVolume);
    }

    if (minOI) {
      options = options.filter((opt: any) => opt.open_interest >= minOI);
    }

    if (minIV) {
      options = options.filter((opt: any) => opt.implied_volatility >= minIV);
    }

    if (maxDTE) {
      options = options.filter((opt: any) => opt.dte <= maxDTE);
    }

    // Sort by volume descending
    options.sort((a: any, b: any) => b.volume - a.volume);

    return NextResponse.json({
      success: true,
      options: options,
      count: options.length,
      symbol: symbol.toUpperCase(),
    });

  } catch (error) {
    console.error('Options API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}
