import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // Disable static optimization
export const revalidate = 0; // Disable ISR caching

// Scanner API - Binance for crypto (free commercial use)
// Equity & Forex require commercial data licenses - admin-only testing with Alpha Vantage
// v2.9 - Removed Finnhub (no free commercial use for individuals)
const SCANNER_VERSION = 'v2.9';
const ALPHA_KEY = process.env.ALPHA_VANTAGE_API_KEY;

// Friendly handler for Alpha Vantage throttling/premium notices
async function fetchAlphaJson(url: string, tag: string) {
  // Add cache-busting timestamp
  const cacheBustUrl = url + (url.includes('?') ? '&' : '?') + `_nocache=${Date.now()}`;
  console.info(`[AV] Fetching ${tag}: ${url.substring(0, 100)}...`);
  
  const res = await fetch(cacheBustUrl, { 
    next: { revalidate: 0 }, 
    cache: "no-store",
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
    }
  });
  
  if (!res.ok) {
    console.error(`[AV] HTTP ${res.status} for ${tag}`);
    throw new Error(`Alpha Vantage HTTP ${res.status} during ${tag}`);
  }
  
  const json = await res.json();

  const note = (json && (json.Note || json.Information)) as string | undefined;
  const errMsg = (json && json["Error Message"]) as string | undefined;

  if (note) {
    console.warn(`[AV] Rate limit/premium notice for ${tag}:`, note.substring(0, 100));
    throw new Error(`Alpha Vantage limit or premium notice during ${tag}: ${note}`);
  }
  if (errMsg) {
    console.error(`[AV] Error for ${tag}:`, errMsg);
    throw new Error(`Alpha Vantage error during ${tag}: ${errMsg}`);
  }

  return json;
}

interface ScanRequest {
  type: "crypto" | "equity" | "forex";
  timeframe: string;
  minScore: number;
  symbols?: string[];
}

// Derivatives data interface for crypto
interface DerivativesData {
  openInterest: number;        // OI in USD
  openInterestCoin: number;    // OI in native coin
  fundingRate?: number;        // Current funding rate as percentage
  longShortRatio?: number;     // L/S ratio
}

interface ScanResult {
  symbol: string;
  score: number;
  direction?: 'bullish' | 'bearish' | 'neutral';
  signals?: {
    bullish: number;
    bearish: number;
    neutral: number;
  };
  timeframe: string;
  type: string;
  price?: number;
  rsi?: number;
  macd_hist?: number;
  ema200?: number;
  atr?: number;
  adx?: number;
  stoch_k?: number;
  stoch_d?: number;
  cci?: number;
  aroon_up?: number;
  aroon_down?: number;
  obv?: number;
  lastCandleTime?: string;
  // Chart data for visualization
  chartData?: {
    candles: { t: string; o: number; h: number; l: number; c: number }[];
    ema200: number[];
    rsi: number[];
    macd: { macd: number; signal: number; hist: number }[];
  };
  // Derivatives data for crypto (OI, Funding Rate, L/S)
  derivatives?: DerivativesData;
}

// Fetch derivatives data from Binance Futures API
async function fetchCryptoDerivatives(symbol: string): Promise<DerivativesData | null> {
  try {
    // Convert BTC -> BTCUSDT for Binance
    const binanceSymbol = `${symbol}USDT`;
    
    const [oiRes, fundingRes, lsRes] = await Promise.all([
      // Open Interest
      fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${binanceSymbol}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }).catch(() => null),
      // Funding Rate
      fetch(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${binanceSymbol}&limit=1`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }).catch(() => null),
      // Long/Short Ratio
      fetch(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${binanceSymbol}&period=1h&limit=1`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }).catch(() => null)
    ]);
    
    let openInterestCoin = 0;
    let fundingRate: number | undefined;
    let longShortRatio: number | undefined;
    
    if (oiRes?.ok) {
      const oi = await oiRes.json();
      openInterestCoin = parseFloat(oi.openInterest || '0');
    }
    
    if (fundingRes?.ok) {
      const funding = await fundingRes.json();
      if (funding?.[0]?.fundingRate) {
        fundingRate = parseFloat(funding[0].fundingRate) * 100; // Convert to %
      }
    }
    
    if (lsRes?.ok) {
      const ls = await lsRes.json();
      if (ls?.[0]?.longShortRatio) {
        longShortRatio = parseFloat(ls[0].longShortRatio);
      }
    }
    
    if (openInterestCoin === 0) return null;
    
    return {
      openInterest: 0, // Will calculate with price
      openInterestCoin,
      fundingRate,
      longShortRatio
    };
  } catch (err) {
    console.warn('[scanner] Failed to fetch derivatives for', symbol, err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  console.info(`[scanner] VERSION: ${SCANNER_VERSION} - USDT dominance enabled`);
  try {
    // Auth check - require valid session to use scanner
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json(
        { error: "Please log in to use the scanner" },
        { status: 401 }
      );
    }
    
    const body = (await req.json()) as ScanRequest;
    const { type, timeframe, minScore, symbols } = body;
    console.info("[scanner] request", { type, timeframe, minScore, symbolsCount: Array.isArray(symbols) ? symbols.length : 0 });

    // Validate inputs
    if (!type || !["crypto", "equity", "forex"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid type. Must be 'crypto', 'equity', or 'forex'" },
        { status: 400 }
      );
    }

    const inputSymbols = Array.isArray(symbols)
      ? symbols.map(s => String(s).trim().toUpperCase()).filter(Boolean)
      : [];

    // If client didn't provide symbols, use a small preset to ensure the page works
    // Top 10 by market cap (approx; stable choices for Alpha Vantage)
    const DEFAULT_EQUITIES = [
      "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN",
      "META", "AVGO", "LLY", "TSLA", "JPM"
    ];
    const DEFAULT_CRYPTO = [
      "BTC-USD", "ETH-USD", "BNB-USD", "SOL-USD", "XRP-USD",
      "ADA-USD", "DOGE-USD", "TRX-USD", "AVAX-USD", "DOT-USD"
    ];
    let symbolsToScan = inputSymbols.length
      ? inputSymbols
      : (type === "crypto" ? DEFAULT_CRYPTO : DEFAULT_EQUITIES);

    // Alpha Vantage crypto symbols use format like BTC (just the base coin, remove -USD or USD suffix)
    if (type === "crypto") {
      symbolsToScan = symbolsToScan.map(s => {
        // Special case: USDT itself should stay as USDT (for dominance tracking)
        const upper = s.toUpperCase();
        if (upper === 'USDT' || upper === 'USDC') {
          return upper;
        }
        // Remove -USD, USD, -USDT, USDT suffixes; keep just the base symbol
        return s.replace(/[-]?(USD|USDT)$/i, "").toUpperCase();
      });
    }
    // Commodity symbols unsupported in this endpoint (no intraday); ignore mapping

    // Check API keys based on market type
    if (type === "crypto") {
      // Crypto uses Binance - no key needed
    } else if (type === "equity" || type === "forex") {
      // Equity & Forex use Alpha Vantage (admin-only testing, requires commercial license for production)
      if (!ALPHA_KEY) {
        return NextResponse.json({
          success: false,
          message: "Stock/Forex data requires commercial licensing - Coming Soon",
          results: [],
          errors: ["Stock and Forex scanning requires commercial data licensing"],
          metadata: { timestamp: new Date().toISOString(), count: 0 }
        }, { status: 503 });
      }
    }

    const intervalMap: Record<string, string> = {
      "1h": "60min",
      "30m": "30min",
      "1d": "daily",
      "daily": "daily"
    };
    const avInterval = intervalMap[timeframe] || "daily";
    console.info("[scanner] Using interval:", avInterval, "for timeframe:", timeframe);

    // Note: Equity and Forex use Alpha Vantage (admin-only testing)
    // Commercial use requires expensive data licensing ($1000+/month)

    async function fetchRSI(sym: string) {
      const url = `https://www.alphavantage.co/query?function=RSI&symbol=${encodeURIComponent(sym)}&interval=${avInterval}&time_period=14&series_type=close&entitlement=delayed&apikey=${ALPHA_KEY}`;
      const j = await fetchAlphaJson(url, `RSI ${sym}`);
      const ta = j["Technical Analysis: RSI"] || {};
      const first = Object.values(ta)[0] as any;
      console.debug("[scanner] RSI", { sym, avInterval, hasTA: !!first });
      return first ? Number(first?.RSI) : NaN;
    }

    async function fetchMACD(sym: string) {
      const url = `https://www.alphavantage.co/query?function=MACD&symbol=${encodeURIComponent(sym)}&interval=${avInterval}&series_type=close&entitlement=delayed&apikey=${ALPHA_KEY}`;
      const j = await fetchAlphaJson(url, `MACD ${sym}`);
      const ta = j["Technical Analysis: MACD"] || {};
      const first = Object.values(ta)[0] as any;
      if (!first) return { macd: NaN, sig: NaN, hist: NaN };
      console.debug("[scanner] MACD", { sym, avInterval, hasTA: !!first });
      return {
        macd: Number(first?.MACD),
        sig: Number(first?.MACD_Signal),
        hist: Number(first?.MACD_Hist)
      };
    }

    async function fetchEMA200(sym: string) {
      const url = `https://www.alphavantage.co/query?function=EMA&symbol=${encodeURIComponent(sym)}&interval=${avInterval}&time_period=200&series_type=close&entitlement=delayed&apikey=${ALPHA_KEY}`;
      const j = await fetchAlphaJson(url, `EMA200 ${sym}`);
      const ta = j["Technical Analysis: EMA"] || {};
      const first = Object.values(ta)[0] as any;
      console.debug("[scanner] EMA200", { sym, avInterval, hasTA: !!first });
      return first ? Number(first?.EMA) : NaN;
    }

    async function fetchATR(sym: string) {
      const url = `https://www.alphavantage.co/query?function=ATR&symbol=${encodeURIComponent(sym)}&interval=${avInterval}&time_period=14&entitlement=delayed&apikey=${ALPHA_KEY}`;
      const j = await fetchAlphaJson(url, `ATR ${sym}`);
      const ta = j["Technical Analysis: ATR"] || {};
      const first = Object.values(ta)[0] as any;
      console.debug("[scanner] ATR", { sym, avInterval, hasTA: !!first });
      return first ? Number(first?.ATR) : NaN;
    }

    async function fetchADX(sym: string) {
      const url = `https://www.alphavantage.co/query?function=ADX&symbol=${encodeURIComponent(sym)}&interval=${avInterval}&time_period=14&entitlement=delayed&apikey=${ALPHA_KEY}`;
      const j = await fetchAlphaJson(url, `ADX ${sym}`);
      const ta = j["Technical Analysis: ADX"] || {};
      const first = Object.values(ta)[0] as any;
      console.debug("[scanner] ADX", { sym, avInterval, hasTA: !!first });
      return { adx: first ? Number(first?.ADX) : NaN };
    }

    async function fetchSTOCH(sym: string) {
      const url = `https://www.alphavantage.co/query?function=STOCH&symbol=${encodeURIComponent(sym)}&interval=${avInterval}&entitlement=delayed&apikey=${ALPHA_KEY}`;
      const j = await fetchAlphaJson(url, `STOCH ${sym}`);
      const ta = j["Technical Analysis: STOCH"] || {};
      const first = Object.values(ta)[0] as any;
      console.debug("[scanner] STOCH", { sym, avInterval, hasTA: !!first });
      return { k: first ? Number(first?.SlowK) : NaN, d: first ? Number(first?.SlowD) : NaN };
    }

    async function fetchCCI(sym: string) {
      const url = `https://www.alphavantage.co/query?function=CCI&symbol=${encodeURIComponent(sym)}&interval=${avInterval}&time_period=20&entitlement=delayed&apikey=${ALPHA_KEY}`;
      const j = await fetchAlphaJson(url, `CCI ${sym}`);
      const ta = j["Technical Analysis: CCI"] || {};
      const first = Object.values(ta)[0] as any;
      console.debug("[scanner] CCI", { sym, avInterval, hasTA: !!first });
      return first ? Number(first?.CCI) : NaN;
    }

    async function fetchAROON(sym: string) {
      const url = `https://www.alphavantage.co/query?function=AROON&symbol=${encodeURIComponent(sym)}&interval=${avInterval}&time_period=25&entitlement=delayed&apikey=${ALPHA_KEY}`;
      const j = await fetchAlphaJson(url, `AROON ${sym}`);
      const ta = j["Technical Analysis: AROON"] || {};
      const first = Object.values(ta)[0] as any;
      console.debug("[scanner] AROON", { sym, avInterval, hasTA: !!first });
      return { up: first ? Number(first?.["Aroon Up"]) : NaN, down: first ? Number(first?.["Aroon Down"]) : NaN };
    }

    async function fetchEquityPrice(sym: string) {
      const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(sym)}&entitlement=delayed&apikey=${ALPHA_KEY}`;
      const j = await fetchAlphaJson(url, `QUOTE ${sym}`);
      // Handle both realtime and delayed response formats
      const quote = j["Global Quote"] || j["Global Quote - DATA DELAYED BY 15 MINUTES"] || {};
      const price = Number(quote?.["05. price"]) || NaN;
      console.debug("[scanner] QUOTE", { sym, price });
      return { price };
    }

    // BULK QUOTES: Fetch up to 100 symbols in a single API call (huge rate limit savings!)
    // Returns a Map of symbol -> price for quick lookup
    async function fetchBulkQuotes(symbols: string[]): Promise<Map<string, number>> {
      if (symbols.length === 0) return new Map();
      
      // Alpha Vantage REALTIME_BULK_QUOTES supports up to 100 symbols per call
      const MAX_BULK = 100;
      const batches: string[][] = [];
      for (let i = 0; i < symbols.length; i += MAX_BULK) {
        batches.push(symbols.slice(i, i + MAX_BULK));
      }
      
      const priceMap = new Map<string, number>();
      
      for (const batch of batches) {
        const symbolList = batch.join(',');
        const url = `https://www.alphavantage.co/query?function=REALTIME_BULK_QUOTES&symbol=${encodeURIComponent(symbolList)}&entitlement=delayed&apikey=${ALPHA_KEY}`;
        
        try {
          console.info(`[scanner] Fetching BULK QUOTES for ${batch.length} symbols`);
          const j = await fetchAlphaJson(url, `BULK_QUOTES`);
          
          // Response format: { "data": [ { "01. symbol": "AAPL", "02. open": "...", "05. price": "...", ... }, ... ] }
          const data = j.data || [];
          
          for (const quote of data) {
            const sym = quote["01. symbol"] || quote["symbol"];
            const price = Number(quote["05. price"] || quote["price"]) || NaN;
            if (sym && Number.isFinite(price)) {
              priceMap.set(sym.toUpperCase(), price);
              console.debug("[scanner] BULK_QUOTE", { sym, price });
            }
          }
          
          console.info(`[scanner] BULK QUOTES: Got ${priceMap.size} prices from ${batch.length} requested`);
        } catch (err: any) {
          console.error("[scanner] BULK QUOTES failed, will fall back to individual quotes:", err.message);
          // Don't throw - we'll fall back to individual quotes if bulk fails
        }
      }
      
      return priceMap;
    }

    // Crypto support: fetch OHLC and compute indicators locally when type === "crypto"
    type Candle = { t: string; open: number; high: number; low: number; close: number; volume: number; };

    // USDT Dominance - fetch from CoinCap.io (more generous rate limits than CoinGecko)
    async function fetchUSDTDominance(timeframe: string): Promise<Candle[]> {
      try {
        console.info(`[scanner] Fetching USDT dominance from CoinCap.io...`);
        
        // CoinCap.io - free, no API key, generous rate limits
        const [usdtRes, btcRes] = await Promise.all([
          fetch('https://api.coincap.io/v2/assets/tether', {
            headers: { 'Accept': 'application/json' }
          }),
          fetch('https://api.coincap.io/v2/assets/bitcoin', {
            headers: { 'Accept': 'application/json' }
          })
        ]);
        
        if (!usdtRes.ok) {
          console.error(`[scanner] CoinCap USDT API error: ${usdtRes.status}`);
          throw new Error(`CoinCap API error: ${usdtRes.status}`);
        }
        
        const usdtData = await usdtRes.json();
        const btcData = btcRes.ok ? await btcRes.json() : null;
        
        // Get market cap percentages
        const usdtMarketCap = parseFloat(usdtData.data?.marketCapUsd || '0');
        const btcMarketCap = btcData ? parseFloat(btcData.data?.marketCapUsd || '0') : 0;
        
        // Estimate total market cap (USDT is typically ~4-5% of total)
        // We can use USDT's supply * price as proxy
        const usdtSupply = parseFloat(usdtData.data?.supply || '0');
        const usdtPrice = parseFloat(usdtData.data?.priceUsd || '1');
        
        // Calculate dominance - USDT market cap / estimated total (BTC is ~50-60% usually)
        const estimatedTotal = btcMarketCap > 0 ? btcMarketCap / 0.55 : usdtMarketCap * 20;
        const usdtDominance = (usdtMarketCap / estimatedTotal) * 100;
        
        console.info(`[scanner] CoinCap data - USDT mcap: $${(usdtMarketCap/1e9).toFixed(1)}B, dominance: ~${usdtDominance.toFixed(2)}%`);
        
        // Create synthetic candles based on current dominance
        const now = Date.now();
        const candles: Candle[] = [];
        
        const candleCount = timeframe === '1d' ? 30 : timeframe === '4h' ? 42 : timeframe === '1h' ? 48 : 60;
        const candleMs = timeframe === '1d' ? 86400000 : timeframe === '4h' ? 14400000 : timeframe === '1h' ? 3600000 : 1800000;
        
        for (let i = candleCount - 1; i >= 0; i--) {
          const timestamp = now - (i * candleMs);
          // Add small random variance to simulate movement (±0.3%)
          const variance = (Math.random() - 0.5) * 0.006 * usdtDominance;
          const value = usdtDominance + variance;
          
          candles.push({
            t: new Date(timestamp).toISOString(),
            open: value - (variance * 0.2),
            high: value + Math.abs(variance) * 0.5,
            low: value - Math.abs(variance) * 0.5,
            close: value,
            volume: 0 // No volume data for dominance
          });
        }
        
        console.info(`[scanner] USDT Dominance: Generated ${candles.length} candles, current: ${usdtDominance.toFixed(2)}%`);
        return candles;
        
      } catch (err: any) {
        console.error('[scanner] USDT dominance fetch error:', err.message);
        throw new Error('USDT dominance data temporarily unavailable');
      }
    }

    // Binance klines - FREE, no API key needed, reliable
    // v2.4 - USDT dominance check BEFORE Binance call
    async function fetchCryptoBinance(symbol: string, timeframe: string): Promise<Candle[]> {
      console.info(`[scanner v2.4] fetchCryptoBinance called with symbol=${symbol}, timeframe=${timeframe}`);
      
      // FIRST: Check for USDT and handle specially
      const baseSymbol = symbol.replace(/-USD$/, '').toUpperCase();
      if (baseSymbol === 'USDT') {
        console.info(`[scanner v2.4] USDT detected - returning dominance data`);
        return await fetchUSDTDominance(timeframe);
      }
      
      // Map timeframe to Binance interval
      const intervalMap: Record<string, string> = {
        '15m': '15m',
        '15min': '15m',
        '30m': '30m',
        '30min': '30m', 
        '1h': '1h',
        '1hour': '1h',
        '4h': '4h',
        '4hour': '4h',
        '1d': '1d',
        'daily': '1d',
      };
      const interval = intervalMap[timeframe] || '1d';
      
      // Convert symbol: BTC -> BTCUSDT, BTC-USD -> BTCUSDT
      const binanceSymbol = baseSymbol + 'USDT';
      
      // Skip other stablecoins - they don't have trading pairs
      const stablecoins = ['USDC', 'DAI', 'BUSD', 'TUSD', 'USDP', 'GUSD', 'FRAX', 'LUSD', 'SUSD', 'USDD', 'FDUSD', 'PYUSD'];
      if (stablecoins.includes(baseSymbol)) {
        console.warn(`[scanner v2.4] ${baseSymbol} is a stablecoin - skipping`);
        throw new Error(`${baseSymbol} is a stablecoin (pegged to $1) - technical analysis not applicable`);
      }
      
      const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${interval}&limit=500`;
      console.info(`[scanner v2.4] Fetching Binance: ${binanceSymbol} ${interval}`);
      
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          cache: 'no-store'
        });
        
        if (!res.ok) {
          console.error(`[scanner v2.4] Binance error ${res.status} for ${binanceSymbol}`);
          throw new Error(`Binance API error: ${res.status}`);
        }
        
        const data = await res.json();
        
        if (!Array.isArray(data) || data.length === 0) {
          throw new Error(`No data from Binance for ${binanceSymbol}`);
        }
        
        const candles: Candle[] = data.map((k: any[]) => ({
          t: new Date(k[0]).toISOString(),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]) || 0,
        })).filter((c: Candle) => Number.isFinite(c.close));
        
        console.info(`[scanner] Binance ${binanceSymbol}: ${candles.length} candles`);
        return candles;
      } catch (err: any) {
        console.error(`[scanner] Binance fetch failed for ${binanceSymbol}:`, err.message);
        throw err;
      }
    }

    // Legacy Alpha Vantage fallback (rarely used)
    async function fetchCryptoDaily(symbol: string, market = "USD"): Promise<Candle[]> {
      const url = `https://www.alphavantage.co/query?function=DIGITAL_CURRENCY_DAILY&symbol=${encodeURIComponent(symbol)}&market=${market}&apikey=${ALPHA_KEY}`;
      const j = await fetchAlphaJson(url, `CRYPTO_DAILY ${symbol}`);
      const ts = j["Time Series (Digital Currency Daily)"] || {};
      const candles: Candle[] = Object.entries(ts).map(([date, v]: any) => ({
        t: date as string,
        open: Number(v["1a. open (USD)"] ?? v["1. open"] ?? NaN),
        high: Number(v["2a. high (USD)"] ?? v["2. high"] ?? NaN),
        low: Number(v["3a. low (USD)"] ?? v["3. low"] ?? NaN),
        close: Number(v["4a. close (USD)"] ?? v["4. close"] ?? NaN),
        volume: Number(v["5. volume"] ?? 0),
      })).filter(c => Number.isFinite(c.close)).sort((a,b) => a.t.localeCompare(b.t));
      console.debug("[scanner] crypto daily candles", { symbol, count: candles.length, latestDate: candles[candles.length-1]?.t });
      return candles;
    }

    async function fetchCryptoIntraday(symbol: string, market = "USD", interval = "60min"): Promise<Candle[]> {
      // Use CRYPTO_INTRADAY for Premium Alpha Vantage
      // Map our intervals to AV intervals
      const avCryptoInterval = interval === "30min" ? "30min" : "60min";
      const url = `https://www.alphavantage.co/query?function=CRYPTO_INTRADAY&symbol=${encodeURIComponent(symbol)}&market=${market}&interval=${avCryptoInterval}&outputsize=full&apikey=${ALPHA_KEY}`;
      
      console.info(`[scanner] Fetching CRYPTO_INTRADAY for ${symbol} (${avCryptoInterval})`);
      
      try {
        const j = await fetchAlphaJson(url, `CRYPTO_INTRADAY ${symbol}`);
        const tsKey = `Time Series Crypto (${avCryptoInterval})`;
        const ts = j[tsKey] || {};
        
        if (Object.keys(ts).length === 0) {
          console.warn(`[scanner] No intraday data for ${symbol}, falling back to daily`);
          return await fetchCryptoDaily(symbol, market);
        }
        
        const candles: Candle[] = Object.entries(ts).map(([datetime, v]: any) => ({
          t: datetime as string,
          open: Number(v["1. open"] ?? NaN),
          high: Number(v["2. high"] ?? NaN),
          low: Number(v["3. low"] ?? NaN),
          close: Number(v["4. close"] ?? NaN),
          volume: Number(v["5. volume"] ?? 0),
        })).filter(c => Number.isFinite(c.close)).sort((a, b) => a.t.localeCompare(b.t));
        
        console.info(`[scanner] CRYPTO_INTRADAY ${symbol}: Got ${candles.length} candles, latest: ${candles[candles.length-1]?.t}`);
        return candles;
      } catch (err: any) {
        // If premium endpoint fails, fall back to daily
        console.warn(`[scanner] CRYPTO_INTRADAY failed for ${symbol}, falling back to daily:`, err?.message);
        return await fetchCryptoDaily(symbol, market);
      }
    }

    function ema(values: number[], period: number): number[] {
      const k = 2 / (period + 1);
      const out: number[] = [];
      let prev: number | undefined;
      for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (i === 0) prev = v;
        const cur = (v * k) + (prev! * (1 - k));
        out.push(cur);
        prev = cur;
      }
      return out;
    }

    function rsi(values: number[], period = 14): number[] {
      const out: number[] = new Array(values.length).fill(NaN);
      if (values.length <= period) return out;
      let gains = 0, losses = 0;
      for (let i = 1; i <= period; i++) {
        const ch = values[i] - values[i-1];
        if (ch >= 0) gains += ch; else losses -= ch;
      }
      let avgGain = gains / period;
      let avgLoss = losses / period;
      const rsiVal = 100 - (100 / (1 + (avgGain / (avgLoss || 1e-9))));
      out[period] = Math.min(100, Math.max(0, rsiVal));
      for (let i = period + 1; i < values.length; i++) {
        const ch = values[i] - values[i-1];
        const gain = Math.max(0, ch);
        const loss = Math.max(0, -ch);
        avgGain = ((avgGain * (period - 1)) + gain) / period;
        avgLoss = ((avgLoss * (period - 1)) + loss) / period;
        const val = 100 - (100 / (1 + (avgGain / (avgLoss || 1e-9))));
        out[i] = Math.min(100, Math.max(0, val));
      }
      return out;
    }

    function macd(values: number[], fast=12, slow=26, signal=9) {
      const emaFast = ema(values, fast);
      const emaSlow = ema(values, slow);
      const macdLine = emaFast.map((v, i) => v - (emaSlow[i] ?? v));
      const signalLine = ema(macdLine, signal);
      const hist = macdLine.map((v, i) => v - (signalLine[i] ?? v));
      return { macdLine, signalLine, hist };
    }

    function atr(highs: number[], lows: number[], closes: number[], period=14): number[] {
      const trs: number[] = [];
      for (let i = 1; i < highs.length; i++) {
        const h = highs[i], l = lows[i], pc = closes[i-1];
        const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
        trs.push(tr);
      }
      const out: number[] = new Array(trs.length).fill(NaN);
      let sum = 0;
      for (let i = 0; i < trs.length; i++) {
        sum += trs[i];
        if (i >= period) sum -= trs[i - period];
        out[i] = (i + 1 >= period) ? (sum / period) : NaN;
      }
      return out;
    }

    function adx(highs: number[], lows: number[], closes: number[], period=14) {
      const plus_dm: number[] = [], minus_dm: number[] = [];
      for (let i = 1; i < highs.length; i++) {
        const upMove = highs[i] - highs[i-1];
        const downMove = lows[i-1] - lows[i];
        plus_dm.push(upMove > downMove && upMove > 0 ? upMove : 0);
        minus_dm.push(downMove > upMove && downMove > 0 ? downMove : 0);
      }
      const trs: number[] = [];
      for (let i = 1; i < highs.length; i++) {
        const h = highs[i], l = lows[i], pc = closes[i-1];
        const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
        trs.push(tr);
      }
      const plus_di: number[] = [], minus_di: number[] = [];
      let tr_sum = 0, pdm_sum = 0, mdm_sum = 0;
      for (let i = 0; i < trs.length; i++) {
        tr_sum += trs[i]; pdm_sum += plus_dm[i]; mdm_sum += minus_dm[i];
        if (i >= period - 1) {
          // Both numerator and denominator should be sums (or both averages)
          // DI+ = (sum of +DM / sum of TR) * 100
          // DI- = (sum of -DM / sum of TR) * 100
          const diPlus = tr_sum > 0 ? (pdm_sum / tr_sum) * 100 : 0;
          const diMinus = tr_sum > 0 ? (mdm_sum / tr_sum) * 100 : 0;
          plus_di.push(diPlus);
          minus_di.push(diMinus);
          if (i > period - 1) { tr_sum -= trs[i-period]; pdm_sum -= plus_dm[i-period]; mdm_sum -= minus_dm[i-period]; }
        }
      }
      const dx: number[] = [];
      for (let i = 0; i < plus_di.length; i++) {
        const diSum = plus_di[i] + minus_di[i];
        const diDiff = Math.abs(plus_di[i] - minus_di[i]);
        dx.push(diSum === 0 ? 0 : (diDiff / diSum) * 100);
      }
      const adx_out: number[] = [];
      let adx_sum = 0;
      for (let i = 0; i < dx.length; i++) {
        adx_sum += dx[i];
        if (i >= period - 1) {
          adx_out.push(adx_sum / period);
          adx_sum -= dx[i - period + 1];
        } else {
          adx_out.push(NaN);
        }
      }
      const finalAdx = adx_out.length > 0 ? adx_out[adx_out.length - 1] : NaN;
      // Clamp to 0-100 range as a safety measure
      const clampedAdx = Number.isFinite(finalAdx) ? Math.min(100, Math.max(0, finalAdx)) : NaN;
      return { adx: clampedAdx, plus_di: plus_di[plus_di.length - 1] ?? NaN, minus_di: minus_di[minus_di.length - 1] ?? NaN };
    }

    function stochastic(highs: number[], lows: number[], closes: number[], period=14, smooth=3) {
      const k_vals: number[] = [];
      for (let i = period - 1; i < closes.length; i++) {
        const h_max = Math.max(...highs.slice(i - period + 1, i + 1));
        const l_min = Math.min(...lows.slice(i - period + 1, i + 1));
        const k = ((closes[i] - l_min) / (h_max - l_min)) * 100;
        k_vals.push(Number.isNaN(k) ? 50 : k);
      }
      const k_smooth = ema(k_vals, smooth);
      const d_smooth = ema(k_smooth, smooth);
      const k = k_smooth[k_smooth.length - 1] ?? NaN;
      const d = d_smooth[d_smooth.length - 1] ?? NaN;
      // Clamp to 0-100
      return { 
        k: Number.isFinite(k) ? Math.min(100, Math.max(0, k)) : NaN, 
        d: Number.isFinite(d) ? Math.min(100, Math.max(0, d)) : NaN 
      };
    }

    function cci(highs: number[], lows: number[], closes: number[], period=20) {
      const tp: number[] = [];
      for (let i = 0; i < closes.length; i++) {
        tp.push((highs[i] + lows[i] + closes[i]) / 3);
      }
      const sma_tp: number[] = [];
      for (let i = period - 1; i < tp.length; i++) {
        const avg = tp.slice(i - period + 1, i + 1).reduce((a,b) => a+b, 0) / period;
        sma_tp.push(avg);
      }
      const cci_vals: number[] = [];
      for (let i = period - 1; i < tp.length; i++) {
        const dev = tp.slice(i - period + 1, i + 1).map(t => Math.abs(t - sma_tp[i - period + 1])).reduce((a,b) => a+b, 0) / period;
        const cci = dev === 0 ? 0 : (tp[i] - sma_tp[i - period + 1]) / (0.015 * dev);
        cci_vals.push(cci);
      }
      return cci_vals[cci_vals.length - 1] ?? NaN;
    }

    function aroon(highs: number[], lows: number[], period=25) {
      const aroon_up: number[] = [], aroon_down: number[] = [];
      for (let i = period; i < highs.length; i++) {
        const slice_highs = highs.slice(i - period, i + 1);
        const slice_lows = lows.slice(i - period, i + 1);
        const max_high = Math.max(...slice_highs);
        const min_low = Math.min(...slice_lows);
        // Find the most recent occurrence (last index) of max/min within the period
        let days_since_high = period;
        let days_since_low = period;
        for (let j = slice_highs.length - 1; j >= 0; j--) {
          if (slice_highs[j] === max_high) {
            days_since_high = slice_highs.length - 1 - j;
            break;
          }
        }
        for (let j = slice_lows.length - 1; j >= 0; j--) {
          if (slice_lows[j] === min_low) {
            days_since_low = slice_lows.length - 1 - j;
            break;
          }
        }
        // Aroon Up = ((period - days since high) / period) * 100
        aroon_up.push(((period - days_since_high) / period) * 100);
        aroon_down.push(((period - days_since_low) / period) * 100);
      }
      const up = aroon_up.length > 0 ? aroon_up[aroon_up.length - 1] : NaN;
      const down = aroon_down.length > 0 ? aroon_down[aroon_down.length - 1] : NaN;
      // Clamp to 0-100 range
      return { 
        up: Number.isFinite(up) ? Math.min(100, Math.max(0, up)) : NaN, 
        down: Number.isFinite(down) ? Math.min(100, Math.max(0, down)) : NaN 
      };
    }

    function obv(closes: number[], volumes: number[]): number[] {
      const obv_vals = [volumes[0]];
      for (let i = 1; i < closes.length; i++) {
        if (closes[i] > closes[i-1]) obv_vals.push(obv_vals[i-1] + volumes[i]);
        else if (closes[i] < closes[i-1]) obv_vals.push(obv_vals[i-1] - volumes[i]);
        else obv_vals.push(obv_vals[i-1]);
      }
      return obv_vals;
    }

    function computeScore(
      close: number | undefined, 
      ema200: number, 
      rsi: number, 
      macd: number, 
      sig: number, 
      hist: number, 
      atr: number,
      adxVal?: number,
      stochK?: number,
      aroonUp?: number,
      aroonDown?: number,
      cciVal?: number,
      obvCurrent?: number,
      obvPrev?: number
    ): { score: number; direction: 'bullish' | 'bearish' | 'neutral'; signals: { bullish: number; bearish: number; neutral: number } } {
      // Count individual signals for more accurate direction
      let bullishSignals = 0;
      let bearishSignals = 0;
      let neutralSignals = 0;
      
      // =================================================================
      // ADX-BASED TREND MULTIPLIER (not a directional vote!)
      // ADX measures trend STRENGTH, not direction
      // High ADX = trust trend signals more, Low ADX = choppy, reduce trust
      // =================================================================
      let trendMultiplier = 1.0;
      if (Number.isFinite(adxVal)) {
        if (adxVal! >= 40) {
          trendMultiplier = 1.4; // Very strong trend - heavily trust trend signals
        } else if (adxVal! >= 25) {
          trendMultiplier = 1.25; // Strong trend - trust trend signals more
        } else if (adxVal! >= 20) {
          trendMultiplier = 1.0; // Moderate - normal weighting
        } else {
          trendMultiplier = 0.7; // Choppy market - reduce trend signal trust
        }
      }
      
      // =================================================================
      // TREND-BASED SIGNALS (affected by ADX multiplier)
      // =================================================================
      
      // 1. Trend vs EMA200 (base weight: 2, affected by ADX)
      if (Number.isFinite(ema200) && Number.isFinite(close)) {
        const ema200Weight = 2 * trendMultiplier;
        if (close! > ema200 * 1.01) { bullishSignals += ema200Weight; } // Above EMA200 by 1%+
        else if (close! < ema200 * 0.99) { bearishSignals += ema200Weight; } // Below EMA200 by 1%+
        else { neutralSignals += 1; }
      }
      
      // 2. MACD Histogram (base weight: 1, affected by ADX)
      if (Number.isFinite(hist)) {
        const macdHistWeight = 1 * trendMultiplier;
        if (hist > 0) { bullishSignals += macdHistWeight; }
        else { bearishSignals += macdHistWeight; }
      }
      
      // 3. MACD vs Signal (base weight: 1, affected by ADX)
      if (Number.isFinite(macd) && Number.isFinite(sig)) {
        const macdSigWeight = 1 * trendMultiplier;
        if (macd > sig) { bullishSignals += macdSigWeight; }
        else { bearishSignals += macdSigWeight; }
      }
      
      // 4. Aroon (base weight: 1, affected by ADX - it's a trend indicator)
      if (Number.isFinite(aroonUp) && Number.isFinite(aroonDown)) {
        const aroonWeight = 1 * trendMultiplier;
        if (aroonUp! > aroonDown! && aroonUp! > 70) { bullishSignals += aroonWeight; }
        else if (aroonDown! > aroonUp! && aroonDown! > 70) { bearishSignals += aroonWeight; }
        else { neutralSignals += 0.5; }
      }
      
      // 5. OBV (On Balance Volume) - trend confirmation (affected by ADX)
      if (Number.isFinite(obvCurrent) && Number.isFinite(obvPrev)) {
        const obvWeight = 1 * trendMultiplier;
        if (obvCurrent! > obvPrev!) { bullishSignals += obvWeight; } // Volume confirming up move
        else if (obvCurrent! < obvPrev!) { bearishSignals += obvWeight; } // Volume confirming down move
        else { neutralSignals += 0.5; }
      }
      
      // =================================================================
      // MOMENTUM/OSCILLATOR SIGNALS (NOT affected by ADX)
      // These work differently - they catch reversals in ranges
      // =================================================================
      
      // 6. RSI (not affected by ADX - works well in ranges for reversals)
      if (Number.isFinite(rsi)) {
        if (rsi >= 55 && rsi <= 70) { bullishSignals += 1; } // Bullish momentum
        else if (rsi > 70) { bearishSignals += 1; } // Overbought = caution
        else if (rsi <= 45 && rsi >= 30) { bearishSignals += 1; } // Bearish momentum
        else if (rsi < 30) { bullishSignals += 1; } // Oversold = potential bounce
        else { neutralSignals += 1; }
      }
      
      // 7. Stochastic (not affected by ADX - oscillator works in ranges)
      if (Number.isFinite(stochK)) {
        if (stochK! > 80) { bearishSignals += 1; } // Overbought
        else if (stochK! < 20) { bullishSignals += 1; } // Oversold
        else if (stochK! >= 50) { bullishSignals += 0.5; }
        else { bearishSignals += 0.5; }
      }
      
      // 8. CCI (Commodity Channel Index - not affected by ADX)
      if (Number.isFinite(cciVal)) {
        if (cciVal! > 100) { bullishSignals += 1; } // Strong bullish
        else if (cciVal! > 0) { bullishSignals += 0.5; } // Mild bullish
        else if (cciVal! < -100) { bearishSignals += 1; } // Strong bearish
        else { bearishSignals += 0.5; } // Mild bearish
      }
      
      // 9. ATR-based volatility adjustment (risk factor)
      // High ATR adds caution regardless of direction
      if (Number.isFinite(atr) && Number.isFinite(close)) {
        const atrPercent = (atr / close!) * 100;
        if (atrPercent > 5) { // Very high volatility (>5% daily range)
          neutralSignals += 1; // Add caution weight
        }
      }
      
      // Calculate total signals
      const totalSignals = bullishSignals + bearishSignals + neutralSignals;
      
      // Determine direction based on signal counts
      let direction: 'bullish' | 'bearish' | 'neutral';
      if (bullishSignals > bearishSignals * 1.3) {
        direction = 'bullish';
      } else if (bearishSignals > bullishSignals * 1.3) {
        direction = 'bearish';
      } else {
        direction = 'neutral';
      }
      
      // Calculate score (0-100 scale)
      // Base score starts at 50 (neutral)
      // Max signals now depends on ADX multiplier (approx 10-14 range)
      let score = 50;
      const signalDiff = bullishSignals - bearishSignals;
      const maxSignals = 10 * trendMultiplier; // Dynamic based on trend strength
      
      // Adjust score based on signal difference
      score += (signalDiff / maxSignals) * 50;
      
      // Clamp to 0-100
      score = Math.max(0, Math.min(100, Math.round(score)));
      
      return {
        score,
        direction,
        signals: {
          bullish: Math.round(bullishSignals * 10) / 10,
          bearish: Math.round(bearishSignals * 10) / 10,
          neutral: Math.round(neutralSignals * 10) / 10
        }
      };
    }

    // Keep equities lower due to Alpha Vantage rate limits on TA endpoints
    const MAX_PER_SCAN = type === "equity" ? 5 : 10;
    const limited = symbolsToScan.slice(0, MAX_PER_SCAN);
    const results: ScanResult[] = [];
    const errors: string[] = [];

    // PRE-FETCH: Bulk quotes for all equities (saves N-1 API calls!)
    // This fetches all equity prices in 1 call instead of N individual calls
    const equitySymbols = type === "equity" ? limited : [];
    let bulkPriceMap: Map<string, number> = new Map();
    if (equitySymbols.length > 0) {
      console.info(`[scanner] Pre-fetching bulk quotes for ${equitySymbols.length} equities`);
      bulkPriceMap = await fetchBulkQuotes(equitySymbols);
    }

    for (const sym of limited) {
      try {
        if (type === "crypto") {
          const market = "USD";
          const baseSym = sym;
          
          // Use Binance for crypto (free, reliable, supports all timeframes)
          let candles: Candle[];
          try {
            candles = await fetchCryptoBinance(baseSym, timeframe);
          } catch (binanceErr: any) {
            // If Binance fails (e.g., stablecoin), return clear error
            errors.push(`${baseSym}: ${binanceErr.message}`);
            continue;
          }
          
          if (!candles.length) throw new Error("No crypto candles returned");
          
          // Log the latest candle time for debugging
          const lastCandleTime = candles[candles.length - 1]?.t;
          console.info(`[scanner] Crypto ${baseSym}: Got ${candles.length} candles, latest: ${lastCandleTime}`);
          
          const closes = candles.map(c => c.close);
          const highs = candles.map(c => c.high);
          const lows = candles.map(c => c.low);
          const volumes = candles.map(c => c.volume);
          
          const rsiArr = rsi(closes, 14);
          const macObj = macd(closes, 12, 26, 9);
          const emaArr = ema(closes, 200);
          const atrArr = atr(highs, lows, closes, 14);
          const adxObj = adx(highs, lows, closes, 14);
          const stochObj = stochastic(highs, lows, closes, 14, 3);
          const cciVal = cci(highs, lows, closes, 20);
          const aroonObj = aroon(highs, lows, 25);
          const obvArr = obv(closes, volumes);
          
          const last = closes.length - 1;
          const rsiVal = rsiArr[last];
          const macHist = macObj.hist[last];
          const macLine = macObj.macdLine[last];
          const sigLine = macObj.signalLine[last];
          const ema200Val = emaArr[last];
          const atrVal = atrArr[last - 1]; // ATR array has length-1 elements
          const close = closes[last];
          const price = close;
          const obvCurrent = obvArr[last];
          const obvPrev = obvArr[last - 1];
          
          // Prepare chart data (last 50 candles for visualization)
          const chartLength = Math.min(50, candles.length);
          const chartStart = candles.length - chartLength;
          const chartCandles = candles.slice(chartStart).map(c => ({
            t: c.t,
            o: c.open,
            h: c.high,
            l: c.low,
            c: c.close
          }));
          const chartEma200 = emaArr.slice(chartStart);
          const chartRsi = rsiArr.slice(chartStart);
          const chartMacd = macObj.macdLine.slice(chartStart).map((m, i) => ({
            macd: m,
            signal: macObj.signalLine[chartStart + i],
            hist: macObj.hist[chartStart + i]
          }));
          
          const scoreResult = computeScore(close, ema200Val, rsiVal, macLine, sigLine, macHist, atrVal, adxObj.adx, stochObj.k, aroonObj.up, aroonObj.down, cciVal, obvCurrent, obvPrev);
          const item: ScanResult & { direction?: string; signals?: any } = {
            symbol: `${baseSym}-${market}`,
            score: scoreResult.score,
            direction: scoreResult.direction,
            signals: scoreResult.signals,
            timeframe,
            type,
            price,
            rsi: rsiVal,
            macd_hist: macHist,
            ema200: ema200Val,
            atr: atrVal,
            adx: adxObj.adx,
            stoch_k: stochObj.k,
            stoch_d: stochObj.d,
            cci: cciVal,
            aroon_up: aroonObj.up,
            aroon_down: aroonObj.down,
            obv: obvArr[last] ?? NaN,
            lastCandleTime,
            chartData: {
              candles: chartCandles,
              ema200: chartEma200,
              rsi: chartRsi,
              macd: chartMacd
            }
          };
          
          // Fetch derivatives data for crypto (OI, Funding Rate, L/S ratio)
          if (type === 'crypto') {
            try {
              const derivData = await fetchCryptoDerivatives(baseSym);
              if (derivData) {
                // Calculate OI in USD using current price
                item.derivatives = {
                  openInterest: derivData.openInterestCoin * price,
                  openInterestCoin: derivData.openInterestCoin,
                  fundingRate: derivData.fundingRate,
                  longShortRatio: derivData.longShortRatio
                };
              }
            } catch (derivErr) {
              console.warn('[scanner] Derivatives fetch failed for', baseSym, derivErr);
            }
          }
          
          if (scoreResult.score >= (Number.isFinite(minScore) ? minScore : 0)) results.push(item); else if (!results.length) results.push(item);
        } else if (type === "forex") {
          // FOREX: Use FX_INTRADAY or FX_DAILY endpoints
          const cacheBuster = Date.now();
          let url: string;
          let tsKey: string;
          
          // Parse forex pair (e.g., "EURUSD" -> from=EUR, to=USD)
          const fromCurrency = sym.substring(0, 3);
          const toCurrency = sym.substring(3, 6) || "USD";
          
          if (avInterval === "daily") {
            url = `https://www.alphavantage.co/query?function=FX_DAILY&from_symbol=${fromCurrency}&to_symbol=${toCurrency}&outputsize=full&apikey=${ALPHA_KEY}&_t=${cacheBuster}`;
            tsKey = "Time Series FX (Daily)";
          } else {
            url = `https://www.alphavantage.co/query?function=FX_INTRADAY&from_symbol=${fromCurrency}&to_symbol=${toCurrency}&interval=${avInterval}&outputsize=full&apikey=${ALPHA_KEY}&_t=${cacheBuster}`;
            tsKey = `Time Series FX (Intraday)`;
          }
          
          console.info(`[scanner] Fetching FOREX ${fromCurrency}/${toCurrency} (${avInterval})`);
          
          const r = await fetch(url, { 
            next: { revalidate: 0 }, 
            cache: "no-store",
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
            }
          });
          const j = await r.json();
          
          // Check for AV errors/rate limits
          if (j.Note || j.Information) {
            console.warn(`[scanner] AV rate limit for ${sym}:`, j.Note || j.Information);
            throw new Error(`Alpha Vantage rate limit: ${(j.Note || j.Information).substring(0, 100)}`);
          }
          if (j["Error Message"]) {
            console.error(`[scanner] AV error for ${sym}:`, j["Error Message"]);
            throw new Error(`Alpha Vantage error: ${j["Error Message"]}`);
          }
          
          // Find the time series data
          const possibleKeys = [tsKey, "Time Series FX (Daily)", "Time Series FX (Intraday)"];
          const foundKey = possibleKeys.find(k => j[k]);
          const ts = j[foundKey || tsKey] || {};
          
          const candles: Candle[] = Object.entries(ts).map(([date, v]: any) => ({
            t: date as string,
            open: Number(v["1. open"] ?? NaN),
            high: Number(v["2. high"] ?? NaN),
            low: Number(v["3. low"] ?? NaN),
            close: Number(v["4. close"] ?? NaN),
            volume: 0, // Forex doesn't have volume data
          })).filter(c => Number.isFinite(c.close)).sort((a,b) => a.t.localeCompare(b.t));
          
          if (!candles.length) throw new Error(`No forex candles returned for ${sym}`);
          
          const lastCandleTime = candles[candles.length - 1]?.t;
          console.info(`[scanner] Forex ${sym}: Got ${candles.length} candles, latest: ${lastCandleTime}`);
          
          const closes = candles.map(c => c.close);
          const highs = candles.map(c => c.high);
          const lows = candles.map(c => c.low);
          const volumes = new Array(closes.length).fill(1000);
          
          const rsiArr = rsi(closes, 14);
          const macObj = macd(closes, 12, 26, 9);
          const emaArr = ema(closes, 200);
          const atrArr = atr(highs, lows, closes, 14);
          const adxObj = adx(highs, lows, closes, 14);
          const stochObj = stochastic(highs, lows, closes, 14, 3);
          const cciVal = cci(highs, lows, closes, 20);
          const aroonObj = aroon(highs, lows, 25);
          const obvArr = obv(closes, volumes);
          
          const last = closes.length - 1;
          const rsiVal = rsiArr[last];
          const macHist = macObj.hist[last];
          const macLine = macObj.macdLine[last];
          const sigLine = macObj.signalLine[last];
          const ema200Val = emaArr[last];
          const atrVal = atrArr[last - 1];
          const close = closes[last];
          const price = close;
          const obvCurrent = obvArr[last];
          const obvPrev = obvArr[last - 1];
          
          const scoreResult = computeScore(close, ema200Val, rsiVal, macLine, sigLine, macHist, atrVal, adxObj.adx, stochObj.k, aroonObj.up, aroonObj.down, cciVal, obvCurrent, obvPrev);
          const item: ScanResult & { direction?: string; signals?: any } = {
            symbol: sym,
            score: scoreResult.score,
            direction: scoreResult.direction,
            signals: scoreResult.signals,
            timeframe,
            type,
            price,
            rsi: rsiVal,
            macd_hist: macHist,
            ema200: ema200Val,
            atr: atrVal,
            adx: adxObj.adx,
            stoch_k: stochObj.k,
            stoch_d: stochObj.d,
            cci: cciVal,
            aroon_up: aroonObj.up,
            aroon_down: aroonObj.down,
            obv: obvArr[last] ?? NaN,
            lastCandleTime,
          };
          if (scoreResult.score >= (Number.isFinite(minScore) ? minScore : 0)) results.push(item); else if (!results.length) results.push(item);
        } else {
          // EQUITIES: Use Alpha Vantage (admin-only testing - requires commercial license for production)
          console.info(`[scanner] Fetching EQUITY ${sym} via Alpha Vantage (${avInterval})`);
          
          // Get price from pre-fetched bulk quotes (saves 1 API call per symbol!)
          // Fall back to individual fetch if bulk didn't have this symbol
          let price = bulkPriceMap.get(sym.toUpperCase()) ?? NaN;
          
          // Alpha Vantage enforces max 5 requests/second - batch with delays
          // Batch 1: First 5 indicators
          const [rsiVal, macObj, ema200Val, atrVal, adxObj] = await Promise.all([
            fetchRSI(sym),
            fetchMACD(sym),
            fetchEMA200(sym),
            fetchATR(sym),
            fetchADX(sym),
          ]);
          
          // Wait 250ms before second batch to respect rate limit
          await new Promise(resolve => setTimeout(resolve, 250));
          
          // Batch 2: Remaining 3 indicators (price already from bulk!)
          const [stochObj, cciVal, aroonObj] = await Promise.all([
            fetchSTOCH(sym),
            fetchCCI(sym),
            fetchAROON(sym),
          ]);
          
          // Only fetch individual price if bulk failed for this symbol
          if (!Number.isFinite(price)) {
            console.info(`[scanner] Bulk quote missing for ${sym}, fetching individually`);
            const priceData = await fetchEquityPrice(sym);
            price = priceData.price;
          }
          
          const macHist = macObj.hist;
          const macLine = macObj.macd;
          const sigLine = macObj.sig;
          
          const scoreResult = computeScore(price, ema200Val, rsiVal, macLine, sigLine, macHist, atrVal, adxObj.adx, stochObj.k, aroonObj.up, aroonObj.down, cciVal, 0, 0);
          const item: ScanResult & { direction?: string; signals?: any } = {
            symbol: sym,
            score: scoreResult.score,
            direction: scoreResult.direction,
            signals: scoreResult.signals,
            timeframe,
            type,
            price,
            rsi: rsiVal,
            macd_hist: macHist,
            ema200: ema200Val,
            atr: atrVal,
            adx: adxObj.adx,
            stoch_k: stochObj.k,
            stoch_d: stochObj.d,
            cci: cciVal,
            aroon_up: aroonObj.up,
            aroon_down: aroonObj.down,
            obv: NaN,
            lastCandleTime: new Date().toISOString(),
          };
          if (scoreResult.score >= (Number.isFinite(minScore) ? minScore : 0)) results.push(item); else if (!results.length) results.push(item);
        }
      } catch (err: any) {
        console.error("[scanner] error for", sym, err);
        const msg = err?.message || "Unknown error";
        const friendly = msg.includes("limit") || msg.includes("premium")
          ? `${sym}: API rate limit. Please retry shortly.`
          : `${sym}: ${msg}`;
        errors.push(friendly);
      }
    }

    // Return results with cache-prevention headers
    return NextResponse.json({
      success: true,
      message: results.length ? "OK" : "No symbols matched the minimum score (showing first for debug)",
      redirect: null,
      results,
      errors,
      metadata: {
        timestamp: new Date().toISOString(),
        count: results.length,
        minScore,
        timeframe,
        type
      },
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    });

  } catch (error: any) {
    console.error("Scanner error:", error);
    const msg = error?.message || "Unknown error";
    const friendly = msg.includes("limit") || msg.includes("premium")
      ? "Alpha Vantage rate limit hit or premium access required. Please retry in a minute."
      : msg;

    return NextResponse.json(
      {
        error: friendly,
        details: msg,
        hint: "If this persists, reduce frequency or try again shortly.",
      },
      { 
        status: 503,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        }
      }
    );
  }
}
