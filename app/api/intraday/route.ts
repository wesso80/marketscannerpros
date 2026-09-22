import { equityObservationUtc } from '@/lib/time/sessionCloseEngine';
import { closedCandles, aggregateClosedCandles } from '@/lib/market/candleIntegrity';
import { NextRequest, NextResponse } from 'next/server';
import { getOHLC, resolveSymbolToId, COINGECKO_ID_MAP } from '@/lib/coingecko';
import { getSessionFromCookie } from '@/lib/auth';
import { avTakeToken } from '@/lib/avRateGovernor';

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
  const upper = symbol.toUpperCase();
  const base = upper.replace(/[-/]?(USDT|USD)$/, '');
  return CRYPTO_SYMBOLS.has(upper) || CRYPTO_SYMBOLS.has(base);
}

interface IntradayBar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

interface IntradayResponse {
  symbol: string;
  interval: IntradayInterval;
  requestedInterval?: string;
  warning?: string;
  lastRefreshed: string;
  timeZone: string;
  source?: 'coingecko' | 'alpha_vantage' | 'memory';
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
      const normalized = symbol.toUpperCase().replace(/[-/]?(USDT|USD)$/, '');
      const coinId = COINGECKO_ID_MAP[symbol.toUpperCase()] || COINGECKO_ID_MAP[normalized] || await resolveSymbolToId(normalized);

      if (!coinId) {
        return NextResponse.json({
          error: 'No CoinGecko mapping available for this crypto symbol',
          symbol,
        }, { status: 404 });
      }

      // The source cannot provide 1/5/15-minute candles. Return an explicit
      // 30-minute view and its identity instead of manufacturing those intervals.
      const actualInterval: IntradayInterval = interval === '60min' ? '60min' : '30min';
      const ohlc = await getOHLC(coinId, 1, { timeoutMs: 8000, retries: 0 });
      const native = closedCandles(ohlc || [], 30 * 60_000);
      const candles = actualInterval === '60min' ? aggregateClosedCandles(native, 30 * 60_000, 60 * 60_000) : native;
      if (!candles.length) return NextResponse.json({ error: 'No verified closed candles available', symbol }, { status: 503 });
      const bars: IntradayBar[] = candles.map(c => ({
        timestamp: c.closeTime.toISOString(), open: c.open, high: c.high, low: c.low, close: c.close, volume: null,
      }));
      const lastRefreshed = bars[bars.length - 1]?.timestamp || new Date().toISOString();

      const result: IntradayResponse = {
        symbol,
        interval: actualInterval,
        requestedInterval: interval,
        warning: 'CoinGecko supplies closed 30-minute OHLC without candle volume. VWAP and volume-based liquidity are unavailable.',
        lastRefreshed,
        timeZone: 'UTC',
        source: 'coingecko',
        data: bars,
        metadata: {
          information: 'CoinGecko closed OHLC; one-day window; no candle volume',
          symbol,
          lastRefreshed,
          interval: actualInterval,
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
    url.searchParams.set('entitlement', 'realtime');
    url.searchParams.set('apikey', ALPHA_VANTAGE_KEY);

    await avTakeToken();
    const response = await fetch(url.toString(), {
      headers: { 'User-Agent': 'MarketScannerPros/1.0' },
      next: { revalidate: 60 } // Cache for 1 minute
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();

    // Check for API errors (never surface raw provider text to users)
    if (data['Error Message']) {
      return NextResponse.json({ 
        error: `No intraday data available for ${symbol}. Check the symbol or try the daily timeframe.`,
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
    const intervalMs = parseInt(interval, 10) * 60_000;
    if (metaData['4. Interval'] !== interval || String(metaData['2. Symbol']).toUpperCase() !== symbol) {
      return NextResponse.json({ error: 'Provider candle identity does not match the request' }, { status: 503 });
    }
    const bars: IntradayBar[] = Object.entries(timeSeries)
      .map(([timestamp, values]: [string, any]) => ({
        timestamp: equityObservationUtc(timestamp).toISOString(),
        open: parseFloat(values['1. open']),
        high: parseFloat(values['2. high']),
        low: parseFloat(values['3. low']),
        close: parseFloat(values['4. close']),
        volume: parseInt(values['5. volume'], 10)
      }))
      .filter(b => {
        const t = Date.parse(b.timestamp);
        return Number.isFinite(t) && t + intervalMs <= Date.now() &&
          [b.open,b.high,b.low,b.close].every(n => Number.isFinite(n) && n > 0) &&
          b.high >= Math.max(b.open,b.low,b.close) && b.low <= Math.min(b.open,b.high,b.close);
      })
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    const deltas = bars.slice(1).map((b,i) => Date.parse(b.timestamp) - Date.parse(bars[i].timestamp));
    if (!bars.length || deltas.some(d => d < intervalMs || d % intervalMs !== 0) || (deltas.length > 0 && !deltas.includes(intervalMs))) {
      return NextResponse.json({ error: 'Provider candle cadence could not be verified for this interval' }, { status: 503 });
    }

    const result: IntradayResponse = {
      symbol: metaData['2. Symbol'],
      interval: interval,
      lastRefreshed: bars.at(-1)?.timestamp || '',
      timeZone: 'UTC',
      source: 'alpha_vantage',
      data: bars,
      metadata: {
        information: metaData['1. Information'],
        symbol: metaData['2. Symbol'],
        lastRefreshed: bars.at(-1)?.timestamp || '',
        interval: metaData['4. Interval'],
        outputSize: metaData['5. Output Size'],
        timeZone: 'UTC'
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
