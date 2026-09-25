import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { avTakeToken } from '@/lib/avRateGovernor';
import { getSimplePrices, resolveSymbolToId } from '@/lib/coingecko';
import { normalizeAssetType, parseAvExchangeRate, parseAvGlobalQuote, splitFxPair, type WatchlistAssetType } from '@/lib/watchlist/quotes';

// POST /api/scanner/quotes - Get current prices for multiple symbols
export async function POST(req: NextRequest) {
  // Auth guard: AV license requires authenticated users only
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Please log in to access market data' }, { status: 401 });
  }

  try {
    const body = await req.json();

    // Typed form: { items: [{ symbol, assetType }] } prices each symbol by its saved asset type
    // (crypto via CoinGecko, forex via Alpha Vantage exchange rates, everything else as a stock).
    if (Array.isArray(body?.items)) {
      return NextResponse.json({ quotes: await fetchTypedQuotes(body.items) });
    }

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
          await avTakeToken();
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
          // Use stock endpoint (realtime data)
          await avTakeToken();
          const res = await fetch(
            `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&entitlement=realtime&apikey=${apiKey}`
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

type TypedQuote = {
  symbol: string;
  assetType: WatchlistAssetType;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  asOf: string | null;
  asOfKind: 'timestamp' | 'trading_day' | null;
  error?: string;
};

function missing(symbol: string, assetType: WatchlistAssetType, error: string): TypedQuote {
  return { symbol, assetType, price: null, change: null, changePercent: null, asOf: null, asOfKind: null, error };
}

async function fetchTypedQuotes(rawItems: unknown[]): Promise<TypedQuote[]> {
  // Same 20-per-request cap as the legacy form; callers batch larger lists.
  const items = rawItems
    .map((i: any) => ({ symbol: String(i?.symbol ?? '').toUpperCase().trim(), assetType: normalizeAssetType(i?.assetType) }))
    .filter((i) => i.symbol && i.symbol.length <= 20)
    .slice(0, 20);
  if (items.length === 0) return [];

  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  const results = new Map<string, TypedQuote>();

  // Crypto: one CoinGecko call for all coins (price, 24h change, provider timestamp).
  const cryptoItems = items.filter((i) => i.assetType === 'crypto');
  if (cryptoItems.length > 0) {
    try {
      const ids = await Promise.all(cryptoItems.map((i) => resolveSymbolToId(i.symbol).catch(() => null)));
      const uniqueIds = [...new Set(ids.filter((id): id is string => Boolean(id)))];
      const prices = uniqueIds.length > 0 ? await getSimplePrices(uniqueIds, { include_24h_change: true }) : null;
      cryptoItems.forEach((item, idx) => {
        const id = ids[idx];
        const p = id ? prices?.[id] : undefined;
        if (!p || !Number.isFinite(p.usd) || p.usd <= 0) {
          results.set(item.symbol, missing(item.symbol, 'crypto', id ? 'No data' : 'Unknown coin'));
          return;
        }
        const asOf = p.last_updated_at ? new Date(p.last_updated_at * 1000).toISOString() : null;
        results.set(item.symbol, {
          symbol: item.symbol,
          assetType: 'crypto',
          price: p.usd,
          change: null,
          changePercent: Number.isFinite(p.usd_24h_change) ? (p.usd_24h_change as number) : null,
          asOf,
          asOfKind: asOf ? 'timestamp' : null,
        });
      });
    } catch (err) {
      console.error('Error fetching crypto quotes:', err);
      cryptoItems.forEach((i) => results.set(i.symbol, missing(i.symbol, 'crypto', 'Fetch failed')));
    }
  }

  // Forex and stocks: Alpha Vantage (rate governed), in parallel like the legacy form.
  await Promise.all(items.filter((i) => i.assetType !== 'crypto').map(async (item) => {
    if (!apiKey) {
      results.set(item.symbol, missing(item.symbol, item.assetType, 'API key not configured'));
      return;
    }
    try {
      if (item.assetType === 'forex') {
        const pair = splitFxPair(item.symbol);
        if (!pair) {
          results.set(item.symbol, missing(item.symbol, 'forex', 'Unrecognised currency pair'));
          return;
        }
        await avTakeToken();
        const res = await fetch(
          `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${pair.from}&to_currency=${pair.to}&apikey=${apiKey}`
        );
        const parsed = parseAvExchangeRate(await res.json());
        results.set(item.symbol, parsed ? { symbol: item.symbol, assetType: 'forex', ...parsed } : missing(item.symbol, 'forex', 'No data'));
        return;
      }
      // Commodities are priced via /api/commodities by the watchlist; anything else is a stock/ETF.
      if (item.assetType === 'commodity') {
        results.set(item.symbol, missing(item.symbol, 'commodity', 'Use /api/commodities'));
        return;
      }
      await avTakeToken();
      const res = await fetch(
        `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(item.symbol)}&entitlement=realtime&apikey=${apiKey}`
      );
      const parsed = parseAvGlobalQuote(await res.json());
      results.set(item.symbol, parsed ? { symbol: item.symbol, assetType: 'equity', ...parsed } : missing(item.symbol, 'equity', 'No data'));
    } catch (err) {
      console.error(`Error fetching ${item.symbol}:`, err);
      results.set(item.symbol, missing(item.symbol, item.assetType, 'Fetch failed'));
    }
  }));

  return items.map((i) => results.get(i.symbol) ?? missing(i.symbol, i.assetType, 'No data'));
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
