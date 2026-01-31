import { NextRequest, NextResponse } from 'next/server';

const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';

type IntradayInterval = '1min' | '5min' | '15min' | '30min' | '60min';

// Common crypto symbols - used to detect if a symbol is crypto
const CRYPTO_SYMBOLS = new Set([
  'BTC', 'ETH', 'XRP', 'BNB', 'SOL', 'DOGE', 'ADA', 'TRX', 'AVAX', 'LINK',
  'DOT', 'MATIC', 'SHIB', 'LTC', 'UNI', 'ATOM', 'XLM', 'ETC', 'FIL', 'APT',
  'NEAR', 'ARB', 'OP', 'INJ', 'IMX', 'AAVE', 'GRT', 'MKR', 'ALGO', 'FTM',
  'HBAR', 'VET', 'SAND', 'MANA', 'AXS', 'CRO', 'EGLD', 'THETA', 'XTZ', 'EOS',
  'PEPE', 'WIF', 'BONK', 'FLOKI', 'RUNE', 'SUI', 'SEI', 'TIA', 'STX', 'RENDER'
]);

function isCryptoSymbol(symbol: string): boolean {
  return CRYPTO_SYMBOLS.has(symbol.toUpperCase());
}

interface IntradayBar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface IntradayResponse {
  symbol: string;
  interval: IntradayInterval;
  lastRefreshed: string;
  timeZone: string;
  data: IntradayBar[];
  metadata: {
    information: string;
    symbol: string;
    lastRefreshed: string;
    interval: string;
    outputSize: string;
    timeZone: string;
  };
  isCrypto?: boolean;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol')?.toUpperCase();
  const interval = (searchParams.get('interval') || '5min') as IntradayInterval;
  const outputSize = searchParams.get('outputsize') || 'compact'; // compact = 100 bars, full = 30 days
  const adjusted = searchParams.get('adjusted') !== 'false';
  const extendedHours = searchParams.get('extended_hours') !== 'false';

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
  }

  // Validate interval
  const validIntervals: IntradayInterval[] = ['1min', '5min', '15min', '30min', '60min'];
  if (!validIntervals.includes(interval)) {
    return NextResponse.json({ 
      error: `Invalid interval. Must be one of: ${validIntervals.join(', ')}` 
    }, { status: 400 });
  }

  if (!ALPHA_VANTAGE_KEY) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  const isCrypto = isCryptoSymbol(symbol);

  try {
    const url = new URL('https://www.alphavantage.co/query');
    
    if (isCrypto) {
      // Use CRYPTO_INTRADAY for cryptocurrency
      url.searchParams.set('function', 'CRYPTO_INTRADAY');
      url.searchParams.set('symbol', symbol);
      url.searchParams.set('market', 'USD');
      url.searchParams.set('interval', interval);
      url.searchParams.set('outputsize', outputSize);
    } else {
      // Use TIME_SERIES_INTRADAY for stocks
      url.searchParams.set('function', 'TIME_SERIES_INTRADAY');
      url.searchParams.set('symbol', symbol);
      url.searchParams.set('interval', interval);
      url.searchParams.set('outputsize', outputSize);
      url.searchParams.set('adjusted', adjusted.toString());
      url.searchParams.set('extended_hours', extendedHours.toString());
    }
    url.searchParams.set('apikey', ALPHA_VANTAGE_KEY);

    const response = await fetch(url.toString(), {
      headers: { 'User-Agent': 'MarketScannerPros/1.0' },
      next: { revalidate: 60 } // Cache for 1 minute
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();

    // Check for API errors
    if (data['Error Message']) {
      return NextResponse.json({ 
        error: data['Error Message'],
        symbol 
      }, { status: 404 });
    }

    if (data['Note']) {
      return NextResponse.json({ 
        error: 'API rate limit reached. Please try again later.',
        note: data['Note']
      }, { status: 429 });
    }

    if (data['Information']) {
      return NextResponse.json({ 
        error: data['Information']
      }, { status: 403 });
    }

    // Parse the response - different key format for crypto
    const metaData = data['Meta Data'];
    const timeSeriesKey = isCrypto 
      ? `Time Series Crypto (${interval})`
      : `Time Series (${interval})`;
    const timeSeries = data[timeSeriesKey];

    if (!timeSeries || !metaData) {
      return NextResponse.json({ 
        error: 'No intraday data available for this symbol',
        symbol 
      }, { status: 404 });
    }

    // Convert to array of bars
    const bars: IntradayBar[] = Object.entries(timeSeries)
      .map(([timestamp, values]: [string, any]) => ({
        timestamp,
        open: parseFloat(values['1. open']),
        high: parseFloat(values['2. high']),
        low: parseFloat(values['3. low']),
        close: parseFloat(values['4. close']),
        volume: parseInt(values['5. volume'], 10)
      }))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const result: IntradayResponse = {
      symbol: isCrypto ? metaData['2. Digital Currency Code'] : metaData['2. Symbol'],
      interval: interval,
      lastRefreshed: metaData['3. Last Refreshed'] || metaData['6. Last Refreshed'],
      timeZone: isCrypto ? metaData['7. Time Zone'] : metaData['6. Time Zone'],
      data: bars,
      metadata: {
        information: metaData['1. Information'],
        symbol: isCrypto ? metaData['2. Digital Currency Code'] : metaData['2. Symbol'],
        lastRefreshed: metaData['3. Last Refreshed'] || metaData['6. Last Refreshed'],
        interval: isCrypto ? metaData['5. Interval'] : metaData['4. Interval'],
        outputSize: isCrypto ? metaData['4. Output Size'] : metaData['5. Output Size'],
        timeZone: isCrypto ? metaData['7. Time Zone'] : metaData['6. Time Zone']
      },
      isCrypto
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Intraday API] Error:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch intraday data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
