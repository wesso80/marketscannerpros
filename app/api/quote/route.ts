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
 * Fetch crypto price using Alpha Vantage DIGITAL_CURRENCY_DAILY
 * Falls back to CoinGecko free API if no API key
 */
async function getCryptoPrice(symbol: string, market: string): Promise<number | null> {
  // Try Alpha Vantage first if API key exists
  if (ALPHA_VANTAGE_API_KEY) {
    try {
      // Use DIGITAL_CURRENCY_DAILY to get latest close price
      const url = `https://www.alphavantage.co/query?function=DIGITAL_CURRENCY_DAILY&symbol=${symbol}&market=${market}&apikey=${ALPHA_VANTAGE_API_KEY}`;
      const res = await fetch(url, { next: { revalidate: 60 } }); // Cache 60s
      const data = await res.json();

      // Get the most recent day's closing price
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

  // Fallback to CoinGecko free API (no key required)
  try {
    // Map common symbols to CoinGecko IDs
    const idMap: Record<string, string> = {
      BTC: "bitcoin",
      ETH: "ethereum",
      XRP: "ripple",
      ADA: "cardano",
      SOL: "solana",
      DOGE: "dogecoin",
      DOT: "polkadot",
      MATIC: "matic-network",
      AVAX: "avalanche-2",
      LINK: "chainlink",
      FET: "fetch-ai",
      BNB: "binancecoin",
      SHIB: "shiba-inu",
      LTC: "litecoin",
      UNI: "uniswap",
      ATOM: "cosmos",
      XLM: "stellar",
      NEAR: "near",
      APT: "aptos",
      ARB: "arbitrum",
      OP: "optimism",
      INJ: "injective-protocol",
      STX: "blockstack",
      ICP: "internet-computer",
      FIL: "filecoin",
      RENDER: "render-token",
      IMX: "immutable-x",
      SUI: "sui",
      SEI: "sei-network",
      TIA: "celestia",
      PEPE: "pepe",
      WIF: "dogwifcoin",
      JUP: "jupiter-exchange-solana",
      HBAR: "hedera-hashgraph",
      KAS: "kaspa",
    };

    const coinId = idMap[symbol] || symbol.toLowerCase();
    const marketLower = market.toLowerCase();

    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=${marketLower}`;
    const res = await fetch(url, { next: { revalidate: 60 } });
    const data = await res.json();

    const price = data[coinId]?.[marketLower];
    if (price) return parseFloat(price);
  } catch (err) {
    console.warn("CoinGecko fallback failed:", err);
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
    const res = await fetch(url, { next: { revalidate: 60 } });
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
    const res = await fetch(url, { next: { revalidate: 60 } });
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
