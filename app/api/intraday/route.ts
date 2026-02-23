import { NextRequest, NextResponse } from 'next/server';
import { getOHLC, resolveSymbolToId, COINGECKO_ID_MAP } from '@/lib/coingecko';
import { getSessionFromCookie } from '@/lib/auth';

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
  source?: 'coingecko' | 'alpha_vantage';
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
  // Auth guard: AV license requires authenticated users only
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Please log in to access market data' }, { status: 401 });
  }

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

  const isCrypto = isCryptoSymbol(symbol);

  if (!isCrypto && !ALPHA_VANTAGE_KEY) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  try {
    if (isCrypto) {
      const normalized = symbol.toUpperCase().replace(/USDT$/, '').replace(/USD$/, '');
      const coinId = COINGECKO_ID_MAP[symbol.toUpperCase()] || COINGECKO_ID_MAP[normalized] || await resolveSymbolToId(normalized);

      if (!coinId) {
        return NextResponse.json({
          error: 'No CoinGecko mapping available for this crypto symbol',
          symbol,
        }, { status: 404 });
      }

      const days = outputSize === 'full' ? 7 : 1;
      const ohlc = await getOHLC(coinId, days as 1 | 7);

      if (!ohlc || ohlc.length === 0) {
        return NextResponse.json({
          error: 'No intraday data available for this symbol',
          symbol,
        }, { status: 404 });
      }

      const bars: IntradayBar[] = ohlc
        .map((candle) => ({
          timestamp: new Date(candle[0]).toISOString(),
          open: Number(candle[1]),
          high: Number(candle[2]),
          low: Number(candle[3]),
          close: Number(candle[4]),
          volume: 0,
        }))
        .filter((bar) => Number.isFinite(bar.open) && Number.isFinite(bar.high) && Number.isFinite(bar.low) && Number.isFinite(bar.close))
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      const lastRefreshed = bars[bars.length - 1]?.timestamp || new Date().toISOString();

      const result: IntradayResponse = {
        symbol,
        interval,
        lastRefreshed,
        timeZone: 'UTC',
        source: 'coingecko',
        data: bars,
        metadata: {
          information: `CoinGecko OHLC (${days}d window)`,
          symbol,
          lastRefreshed,
          interval,
          outputSize,
          timeZone: 'UTC'
        },
        isCrypto: true,
      };

      return NextResponse.json(result);
    }

    const url = new URL('https://www.alphavantage.co/query');

    // Use TIME_SERIES_INTRADAY for stocks
    url.searchParams.set('function', 'TIME_SERIES_INTRADAY');
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', interval);
    url.searchParams.set('outputsize', outputSize);
    url.searchParams.set('adjusted', adjusted.toString());
    url.searchParams.set('extended_hours', extendedHours.toString());
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

    // Parse the response
    const metaData = data['Meta Data'];
    const timeSeriesKey = `Time Series (${interval})`;
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
      symbol: metaData['2. Symbol'],
      interval: interval,
      lastRefreshed: metaData['3. Last Refreshed'] || metaData['6. Last Refreshed'],
      timeZone: metaData['6. Time Zone'],
      source: 'alpha_vantage',
      data: bars,
      metadata: {
        information: metaData['1. Information'],
        symbol: metaData['2. Symbol'],
        lastRefreshed: metaData['3. Last Refreshed'] || metaData['6. Last Refreshed'],
        interval: metaData['4. Interval'],
        outputSize: metaData['5. Output Size'],
        timeZone: metaData['6. Time Zone']
      },
      isCrypto: false
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
