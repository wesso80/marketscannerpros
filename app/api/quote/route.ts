import { NextRequest, NextResponse } from "next/server";
import { getPriceBySymbol, COINGECKO_ID_MAP, symbolToId } from "@/lib/coingecko";
import { shouldUseCache, canFallbackToAV, getCacheMode } from "@/lib/cacheMode";
import { getQuote } from "@/lib/onDemandFetch";

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

    if (type === "crypto") {
      const cryptoQuote = await getCryptoPrice(symbol, market);
      price = cryptoQuote?.price ?? null;
      source = cryptoQuote?.source;
    } else if (type === "stock") {
      price = await getStockPrice(symbol, { strict });
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
 */
async function getCryptoPrice(symbol: string, _market: string): Promise<{ price: number; source: 'coingecko' } | null> {
  // Primary: Use CoinGecko Commercial API for all crypto
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
async function getStockPrice(symbol: string, options?: { strict?: boolean }): Promise<number | null> {
  const strict = Boolean(options?.strict);
  const useCache = shouldUseCache();
  const allowAVFallback = canFallbackToAV();

  // Try cached data first (if cache mode enabled)
  if (useCache && !strict) {
    try {
      const cachedQuote = await getQuote(symbol);
      if (cachedQuote?.price) {
        console.log(`[quote] ${symbol} served from ${cachedQuote.source} (${getCacheMode()} mode)`);
        return cachedQuote.price;
      }
    } catch (err) {
      console.warn(`[quote] Cache lookup failed for ${symbol}:`, err);
    }
  }

  // Fallback to direct AV call (if allowed)
  if (allowAVFallback && ALPHA_VANTAGE_API_KEY) {
    try {
      const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`;
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json();

      const price = data["Global Quote"]?.["05. price"];
      if (price) {
        console.log(`[quote] ${symbol} served from direct AV call (${getCacheMode()} mode)`);
        return parseFloat(price);
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

  // Fallback to direct AV call (if allowed)
  if (allowAVFallback && ALPHA_VANTAGE_API_KEY) {
    try {
      const url = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${symbol}&to_currency=${market}&apikey=${ALPHA_VANTAGE_API_KEY}`;
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json();

      const rate = data["Realtime Currency Exchange Rate"]?.[
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
