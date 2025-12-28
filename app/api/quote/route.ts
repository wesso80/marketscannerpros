import { NextRequest, NextResponse } from "next/server";

/**
 * /api/quote?symbol=XRPUSD&type=crypto&market=USD
 * 
 * Returns live price data for any ticker using Alpha Vantage or fallback sources.
 * 
 * Supports:
 * - Crypto: BTC, ETH, XRP, etc. (vs USD/EUR/etc.)
 * - Stocks: AAPL, NVDA, TSLA, etc.
 * - FX: EUR/USD, GBP/USD, etc.
 */

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || "";

type AssetType = "crypto" | "stock" | "fx";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get("symbol")?.toUpperCase() || "";
    const type = (url.searchParams.get("type") as AssetType) || "crypto";
    const market = url.searchParams.get("market")?.toUpperCase() || "USD";

    if (!symbol) {
      return NextResponse.json(
        { ok: false, error: "Missing symbol parameter" },
        { status: 400 }
      );
    }

    // Try to fetch price based on asset type
    let price: number | null = null;

    if (type === "crypto") {
      price = await getCryptoPrice(symbol, market);
    } else if (type === "stock") {
      price = await getStockPrice(symbol);
    } else if (type === "fx") {
      price = await getFxPrice(symbol, market);
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
 * Mapping of crypto symbols to CoinGecko IDs for tokens where Yahoo Finance
 * returns the wrong token (e.g., JUP returns a different "Jupiter USD" token)
 */
const COINGECKO_ID_MAP: Record<string, string> = {
  'JUP': 'jupiter-exchange-solana',  // Jupiter DEX on Solana (not "Jupiter USD")
  'XCN': 'chain-2',                   // Onyxcoin (not "Cryptonite USD")
  'RENDER': 'render-token',           // Render Token
  'RNDR': 'render-token',             // Render Token (alternate symbol)
  'KAS': 'kaspa',                     // Kaspa
  'FET': 'fetch-ai',                  // Fetch.AI
  'TIA': 'celestia',                  // Celestia
  'SEI': 'sei-network',               // Sei Network
  'SUI': 'sui',                       // Sui
  'INJ': 'injective-protocol',        // Injective
  'ARB': 'arbitrum',                  // Arbitrum
  'OP': 'optimism',                   // Optimism
  'BLUR': 'blur',                     // Blur
  'PENDLE': 'pendle',                 // Pendle
  'PYTH': 'pyth-network',             // Pyth Network
  'BONK': 'bonk',                     // Bonk
  'WIF': 'dogwifcoin',                // dogwifhat
  'PEPE': 'pepe',                     // Pepe
  'FLOKI': 'floki',                   // Floki
};

/**
 * Fetch price from CoinGecko for specific tokens that Yahoo gets wrong
 */
async function getCoinGeckoPrice(symbol: string): Promise<number | null> {
  const geckoId = COINGECKO_ID_MAP[symbol.toUpperCase()];
  if (!geckoId) return null;
  
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd`;
    const res = await fetch(url, { 
      cache: 'no-store',
      headers: {
        'Accept': 'application/json'
      }
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
 * Fetch crypto price using Yahoo Finance (free, no API key required)
 * Uses CoinGecko for specific tokens where Yahoo returns wrong data
 * Falls back to Alpha Vantage if both fail
 */
async function getCryptoPrice(symbol: string, market: string): Promise<number | null> {
  // For tokens where Yahoo Finance returns wrong data, use CoinGecko first
  if (COINGECKO_ID_MAP[symbol.toUpperCase()]) {
    const geckoPrice = await getCoinGeckoPrice(symbol);
    if (geckoPrice !== null) {
      return geckoPrice;
    }
    // Fall through to try other sources if CoinGecko fails
  }

  // Try Yahoo Finance (free, no API key required)
  try {
    // Yahoo Finance uses format: BTC-USD, ETH-USD, etc.
    const yahooSymbol = `${symbol}-${market}`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=1d`;
    
    const res = await fetch(url, { 
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (res.ok) {
      const data = await res.json();
      const result = data.chart?.result?.[0];
      const meta = result?.meta;
      
      if (meta?.regularMarketPrice) {
        return meta.regularMarketPrice;
      }
    }
  } catch (err) {
    console.warn("Yahoo Finance crypto fetch failed:", err);
  }

  // Fallback to Alpha Vantage if API key exists
  if (ALPHA_VANTAGE_API_KEY) {
    try {
      const url = `https://www.alphavantage.co/query?function=DIGITAL_CURRENCY_DAILY&symbol=${symbol}&market=${market}&apikey=${ALPHA_VANTAGE_API_KEY}`;
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json();

      const timeSeries = data["Time Series (Digital Currency Daily)"];
      if (timeSeries) {
        const latestDate = Object.keys(timeSeries)[0];
        const latestData = timeSeries[latestDate];
        const closePrice = latestData[`4a. close (${market})`];
        if (closePrice) return parseFloat(closePrice);
      }
    } catch (err) {
      console.warn("Alpha Vantage crypto fetch failed:", err);
    }
  }

  return null;
}

/**
 * Fetch stock price using Alpha Vantage GLOBAL_QUOTE
 */
async function getStockPrice(symbol: string): Promise<number | null> {
  if (!ALPHA_VANTAGE_API_KEY) {
    console.warn("No ALPHA_VANTAGE_API_KEY - cannot fetch stock prices");
    return null;
  }

  try {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();

    const price = data["Global Quote"]?.["05. price"];
    if (price) return parseFloat(price);
  } catch (err) {
    console.warn("Alpha Vantage stock fetch failed:", err);
  }

  return null;
}

/**
 * Fetch FX rate using Alpha Vantage CURRENCY_EXCHANGE_RATE
 * Example: symbol=EUR, market=USD → EUR/USD rate
 */
async function getFxPrice(symbol: string, market: string): Promise<number | null> {
  if (!ALPHA_VANTAGE_API_KEY) {
    console.warn("No ALPHA_VANTAGE_API_KEY - cannot fetch FX rates");
    return null;
  }

  try {
    const url = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${symbol}&to_currency=${market}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();

    const rate = data["Realtime Currency Exchange Rate"]?.[
      "5. Exchange Rate"
    ];
    if (rate) return parseFloat(rate);
  } catch (err) {
    console.warn("Alpha Vantage FX fetch failed:", err);
  }

  return null;
}
