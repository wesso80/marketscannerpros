import { NextRequest, NextResponse } from "next/server";
import { getPriceBySymbol, COINGECKO_ID_MAP, symbolToId, getMarketData, resolveSymbolToId } from "@/lib/coingecko";
import { shouldUseCache, canFallbackToAV, getCacheMode } from "@/lib/cacheMode";
import { getQuote } from "@/lib/onDemandFetch";
import { apiLimiter, getClientIP } from "@/lib/rateLimit";
import { avFetch } from "@/lib/avRateGovernor";

/**
 * /api/quote?symbol=XRPUSD&type=crypto&market=USD
 * 
 * Returns live price data for any ticker using CoinGecko (commercial plan) or fallback sources.
 * 
 * Supports:
 * - Crypto: BTC, ETH, XRP, etc. (vs USD/EUR/etc.) - Uses CoinGecko commercial API
 * - Stocks: AAPL, NVDA, TSLA, etc. - Uses cached data → Alpha Vantage fallback
 * - FX: EUR/USD, GBP/USD, etc. - Uses Alpha Vantage
 * 
 * Cache Mode (CACHE_MODE env var):
 * - 'legacy': Direct AV calls (default)
 * - 'prefer_cache': Cache first, AV fallback
 * - 'cache_only': Cache only, no AV calls
 */

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || "";
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;

type AssetType = "crypto" | "stock" | "fx";

export async function GET(req: NextRequest) {
  // Rate limit: 60 req/min per IP to prevent quota exhaustion
  const ip = getClientIP(req);
  const rateCheck = apiLimiter.check(ip);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please slow down.", retryAfter: rateCheck.retryAfter },
      { status: 429, headers: { "Retry-After": String(rateCheck.retryAfter) } }
    );
  }

  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get("symbol")?.toUpperCase() || "";
    const type = (url.searchParams.get("type") as AssetType) || "crypto";
    const market = url.searchParams.get("market")?.toUpperCase() || "USD";
    const strict = ['1', 'true', 'yes'].includes((url.searchParams.get('strict') || '').toLowerCase());

    if (!symbol) {
      return NextResponse.json(
        { ok: false, error: "Missing symbol parameter" },
        { status: 400 }
      );
    }

    // Try to fetch price based on asset type
    let price: number | null = null;
    let source: string | undefined;
    let extraFields: Record<string, any> = {};

    if (type === "crypto") {
      const cryptoQuote = await getCryptoQuoteFull(symbol, market);
      if (cryptoQuote) {
        price = cryptoQuote.price;
        source = cryptoQuote.source;
        extraFields = {
          open: cryptoQuote.open,
          high: cryptoQuote.high,
          low: cryptoQuote.low,
          previousClose: cryptoQuote.previousClose,
          change: cryptoQuote.change,
          changePercent: cryptoQuote.changePercent,
          volume: cryptoQuote.volume,
          marketCap: cryptoQuote.marketCap,
          marketCapRank: cryptoQuote.marketCapRank,
          circulatingSupply: cryptoQuote.circulatingSupply,
          totalSupply: cryptoQuote.totalSupply,
        };
      }
    } else if (type === "stock") {
      const stockResult = await getStockQuoteFull(symbol, { strict });
      if (stockResult) {
        price = stockResult.price;
        source = stockResult.source;
        extraFields = {
          open: stockResult.open,
          high: stockResult.high,
          low: stockResult.low,
          previousClose: stockResult.previousClose,
          change: stockResult.change,
          changePercent: stockResult.changePercent,
          volume: stockResult.volume,
        };
      }
    } else if (type === "fx") {
      price = await getFxPrice(symbol, market, { strict });
    }

    if (price === null || isNaN(price)) {
      return NextResponse.json(
        { ok: false, error: `Could not fetch price for ${symbol}` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      price,
      symbol,
      type,
      strict,
      ...(source ? { source } : {}),
      ...extraFields,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("Quote API error:", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * Fetch price from CoinGecko Commercial API (500K calls/month)
 * Uses API key for higher rate limits and commercial usage rights
 */
async function getCoinGeckoPrice(symbol: string): Promise<number | null> {
  // Try the new centralized library first
  const priceData = await getPriceBySymbol(symbol);
  if (priceData) {
    return priceData.price;
  }
  
  // Fallback: try to find CoinGecko ID directly
  const geckoId = symbolToId(symbol) || COINGECKO_ID_MAP[symbol.toUpperCase()];
  if (!geckoId) return null;
  
  try {
    const baseUrl = COINGECKO_API_KEY 
      ? 'https://pro-api.coingecko.com/api/v3' 
      : 'https://api.coingecko.com/api/v3';
    
    const headers: HeadersInit = { 'Accept': 'application/json' };
    if (COINGECKO_API_KEY) {
      headers['x-cg-pro-api-key'] = COINGECKO_API_KEY;
    }
    
    const url = `${baseUrl}/simple/price?ids=${geckoId}&vs_currencies=usd`;
    const res = await fetch(url, { 
      cache: 'no-store',
      headers
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data[geckoId]?.usd) {
        return data[geckoId].usd;
      }
    }
  } catch (err) {
    console.warn(`CoinGecko fetch failed for ${symbol}:`, err);
  }
  
  return null;
}

/**
 * Fetch crypto price using CoinGecko Commercial API (primary)
 * Returns full market data: price, 24h OHLC, change, volume, market cap
 */
interface CryptoQuoteFull {
  price: number;
  open?: number;
  high?: number;
  low?: number;
  previousClose?: number;
  change?: number;
  changePercent?: number;
  volume?: number;
  marketCap?: number;
  marketCapRank?: number;
  circulatingSupply?: number;
  totalSupply?: number;
  source: string;
}

async function getCryptoQuoteFull(symbol: string, _market: string): Promise<CryptoQuoteFull | null> {
  // Try getMarketData first — returns full 24h stats
  const coinId = await resolveSymbolToId(symbol) || symbolToId(symbol) || COINGECKO_ID_MAP[symbol.toUpperCase()];
  if (coinId) {
    try {
      const marketData = await getMarketData({ ids: [coinId], per_page: 1 });
      if (marketData && marketData.length > 0) {
        const d = marketData[0];
        const price = d.current_price;
        const change24h = d.price_change_24h ?? 0;
        // CoinGecko doesn't have "open" directly, but we can derive it: open ≈ price - change24h
        const open = price - change24h;
        return {
          price,
          open: Number.isFinite(open) ? open : undefined,
          high: d.high_24h ?? undefined,
          low: d.low_24h ?? undefined,
          previousClose: Number.isFinite(open) ? open : undefined,
          change: Number.isFinite(change24h) ? change24h : undefined,
          changePercent: Number.isFinite(d.price_change_percentage_24h) ? d.price_change_percentage_24h : undefined,
          volume: d.total_volume ?? undefined,
          marketCap: d.market_cap ?? undefined,
          marketCapRank: d.market_cap_rank ?? undefined,
          circulatingSupply: d.circulating_supply ?? undefined,
          totalSupply: d.total_supply ?? undefined,
          source: 'coingecko',
        };
      }
    } catch (err) {
      console.warn(`[quote] CoinGecko market data failed for ${symbol}:`, err);
    }
  }

  // Fallback: simple price only
  const geckoPrice = await getCoinGeckoPrice(symbol);
  if (geckoPrice !== null) {
    return { price: geckoPrice, source: 'coingecko' };
  }

  return null;
}

/**
 * Fetch stock price - uses cache layer when enabled
 * Cache Mode determines behavior:
 * - legacy: Direct AV call (old behavior)
 * - prefer_cache: Cache first, AV fallback
 * - cache_only: Cache only
 */
interface StockQuoteFull {
  price: number;
  open?: number;
  high?: number;
  low?: number;
  previousClose?: number;
  change?: number;
  changePercent?: number;
  volume?: number;
  source?: string;
}

async function getStockQuoteFull(symbol: string, options?: { strict?: boolean }): Promise<StockQuoteFull | null> {
  const strict = Boolean(options?.strict);
  const useCache = shouldUseCache();
  const allowAVFallback = canFallbackToAV();

  // Try cached data first (if cache mode enabled)
  if (useCache && !strict) {
    try {
      const cachedQuote = await getQuote(symbol);
      if (cachedQuote?.price) {
        console.log(`[quote] ${symbol} served from ${cachedQuote.source} (${getCacheMode()} mode)`);
        return {
          price: cachedQuote.price,
          open: Number.isFinite(cachedQuote.open) ? cachedQuote.open : undefined,
          high: Number.isFinite(cachedQuote.high) ? cachedQuote.high : undefined,
          low: Number.isFinite(cachedQuote.low) ? cachedQuote.low : undefined,
          previousClose: Number.isFinite(cachedQuote.prevClose) ? cachedQuote.prevClose : undefined,
          change: Number.isFinite(cachedQuote.changeAmt) ? cachedQuote.changeAmt : undefined,
          changePercent: Number.isFinite(cachedQuote.changePct) ? cachedQuote.changePct : undefined,
          volume: cachedQuote.volume,
          source: cachedQuote.source,
        };
      }
    } catch (err) {
      console.warn(`[quote] Cache lookup failed for ${symbol}:`, err);
    }
  }

  // Fallback to direct AV call (if allowed) — rate governed
  if (allowAVFallback && ALPHA_VANTAGE_API_KEY) {
    try {
      const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`;
      const data = await avFetch(url, `QUOTE ${symbol}`);

      const gq = data?.["Global Quote"] || data?.["Global Quote - DATA DELAYED BY 15 MINUTES"];
      const price = gq?.["05. price"];
      if (price) {
        console.log(`[quote] ${symbol} served from direct AV call (${getCacheMode()} mode)`);
        const pf = (v: string | undefined) => v ? parseFloat(v) : undefined;
        return {
          price: parseFloat(price),
          open: pf(gq["02. open"]),
          high: pf(gq["03. high"]),
          low: pf(gq["04. low"]),
          previousClose: pf(gq["08. previous close"]),
          change: pf(gq["09. change"]),
          changePercent: pf(gq["10. change percent"]?.replace('%', '')),
          volume: gq["06. volume"] ? parseInt(gq["06. volume"], 10) : undefined,
          source: 'alphavantage',
        };
      }
    } catch (err) {
      console.warn("Alpha Vantage stock fetch failed:", err);
    }
  }

  // cache_only mode and nothing in cache
  if (!allowAVFallback) {
    console.warn(`[quote] ${symbol} not in cache (cache_only mode, no AV fallback)`);
  }

  return null;
}

/**
 * Fetch FX rate - uses cache layer when enabled
 * Example: symbol=EUR, market=USD → EUR/USD rate
 */
async function getFxPrice(symbol: string, market: string, options?: { strict?: boolean }): Promise<number | null> {
  const strict = Boolean(options?.strict);
  const useCache = shouldUseCache();
  const allowAVFallback = canFallbackToAV();

  // For forex, we store as combined symbol (e.g., EURUSD)
  const fxSymbol = `${symbol}${market}`;

  // Try cached data first (if cache mode enabled)
  if (useCache && !strict) {
    try {
      const cachedQuote = await getQuote(fxSymbol);
      if (cachedQuote?.price) {
        console.log(`[quote] ${fxSymbol} served from ${cachedQuote.source} (${getCacheMode()} mode)`);
        return cachedQuote.price;
      }
    } catch (err) {
      console.warn(`[quote] Cache lookup failed for ${fxSymbol}:`, err);
    }
  }

  // Fallback to direct AV call (if allowed) — rate governed
  if (allowAVFallback && ALPHA_VANTAGE_API_KEY) {
    try {
      const url = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${symbol}&to_currency=${market}&apikey=${ALPHA_VANTAGE_API_KEY}`;
      const data = await avFetch(url, `FX ${symbol}${market}`);

      const rate = data?.["Realtime Currency Exchange Rate"]?.[
        "5. Exchange Rate"
      ];
      if (rate) {
        console.log(`[quote] ${fxSymbol} served from direct AV call (${getCacheMode()} mode)`);
        return parseFloat(rate);
      }
    } catch (err) {
      console.warn("Alpha Vantage FX fetch failed:", err);
    }
  }

  return null;
}
