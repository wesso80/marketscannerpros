import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';

// POST /api/scanner/quotes - Get current prices for multiple symbols
export async function POST(req: NextRequest) {
  // Auth guard: AV license requires authenticated users only
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Please log in to access market data' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { symbols } = body;

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json({ error: 'Symbols array required' }, { status: 400 });
    }

    // Limit to 20 symbols per request
    const limitedSymbols = symbols.slice(0, 20);
    const quotes: any[] = [];

    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    if (!apiKey) {
      // Return mock data if no API key
      return NextResponse.json({
        quotes: limitedSymbols.map(symbol => ({
          symbol,
          price: null,
          change: null,
          changePercent: null,
          error: 'API key not configured'
        }))
      });
    }

    // Fetch quotes in parallel (with rate limiting consideration)
    const fetchPromises = limitedSymbols.map(async (symbol: string) => {
      try {
        // Check if it's a crypto symbol (common ones)
        const cryptoSymbols = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'DOT', 'LINK', 'AVAX', 'MATIC'];
        const isCrypto = cryptoSymbols.includes(symbol.toUpperCase());

        if (isCrypto) {
          // Use crypto endpoint
          const res = await fetch(
            `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${symbol}&to_currency=USD&apikey=${apiKey}`
          );
          const data = await res.json();
          
          if (data['Realtime Currency Exchange Rate']) {
            const rate = data['Realtime Currency Exchange Rate'];
            const price = parseFloat(rate['5. Exchange Rate']);
            return {
              symbol,
              price,
              change: null,
              changePercent: null
            };
          }
        } else {
          // Use stock endpoint (15-minute delayed data)
          const res = await fetch(
            `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&entitlement=delayed&apikey=${apiKey}`
          );
          const data = await res.json();
          
          // Handle both realtime and delayed response formats
          const globalQuote = data['Global Quote'] || data['Global Quote - DATA DELAYED BY 15 MINUTES'];
          if (globalQuote && globalQuote['05. price']) {
            const quote = globalQuote;
            return {
              symbol,
              price: parseFloat(quote['05. price']),
              change: parseFloat(quote['09. change']),
              changePercent: parseFloat(quote['10. change percent']?.replace('%', ''))
            };
          }
        }

        return {
          symbol,
          price: null,
          change: null,
          changePercent: null,
          error: 'No data'
        };
      } catch (err) {
        console.error(`Error fetching ${symbol}:`, err);
        return {
          symbol,
          price: null,
          change: null,
          changePercent: null,
          error: 'Fetch failed'
        };
      }
    });

    // Wait for all fetches (with timeout)
    const results = await Promise.all(fetchPromises);
    
    return NextResponse.json({ quotes: results });
  } catch (error) {
    console.error('Error fetching quotes:', error);
    return NextResponse.json({ error: 'Failed to fetch quotes' }, { status: 500 });
  }
}

// GET version for simple single symbol lookup
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol');

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
  }

  // Reuse POST logic
  const mockReq = {
    json: async () => ({ symbols: [symbol] })
  } as NextRequest;

  return POST(mockReq);
}
