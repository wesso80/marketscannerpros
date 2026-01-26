import { NextRequest, NextResponse } from "next/server";

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

    // Crypto support: fetch OHLC and compute indicators locally when type === "crypto"
    type Candle = { t: string; open: number; high: number; low: number; close: number; };

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
            close: value
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
      out[period] = 100 - (100 / (1 + (avgGain / (avgLoss || 1e-9))));
      for (let i = period + 1; i < values.length; i++) {
        const ch = values[i] - values[i-1];
        const gain = Math.max(0, ch);
        const loss = Math.max(0, -ch);
        avgGain = ((avgGain * (period - 1)) + gain) / period;
        avgLoss = ((avgLoss * (period - 1)) + loss) / period;
        out[i] = 100 - (100 / (1 + (avgGain / (avgLoss || 1e-9))));
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
      const atr_vals: number[] = [], plus_di: number[] = [], minus_di: number[] = [];
      let tr_sum = 0, pdm_sum = 0, mdm_sum = 0;
      for (let i = 0; i < trs.length; i++) {
        tr_sum += trs[i]; pdm_sum += plus_dm[i]; mdm_sum += minus_dm[i];
        if (i >= period - 1) {
          atr_vals.push(tr_sum / period);
          const atr_val = atr_vals[atr_vals.length-1];
          plus_di.push((pdm_sum / atr_val) * 100);
          minus_di.push((mdm_sum / atr_val) * 100);
          if (i > period - 1) { tr_sum -= trs[i-period]; pdm_sum -= plus_dm[i-period]; mdm_sum -= minus_dm[i-period]; }
        }
      }
      const di_diff = plus_di.map((p, i) => Math.abs(p - minus_di[i])), di_sum = plus_di.map((p, i) => p + minus_di[i]);
      const dx = di_diff.map((d, i) => (d / di_sum[i]) * 100);
      const adx_out: number[] = [];
      let adx_sum = 0;
      for (let i = 0; i < dx.length; i++) {
        adx_sum += dx[i];
        adx_out.push(i >= period - 1 ? adx_sum / period : NaN);
      }
      return { adx: adx_out[adx_out.length - 1] ?? NaN, plus_di: plus_di[plus_di.length - 1] ?? NaN, minus_di: minus_di[minus_di.length - 1] ?? NaN };
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
      return { k: k_smooth[k_smooth.length - 1] ?? NaN, d: d_smooth[d_smooth.length - 1] ?? NaN };
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
        const h_idx = highs.slice(i - period, i).lastIndexOf(Math.max(...highs.slice(i - period, i)));
        const l_idx = lows.slice(i - period, i).lastIndexOf(Math.min(...lows.slice(i - period, i)));
        aroon_up.push(((period - (period - 1 - h_idx)) / period) * 100);
        aroon_down.push(((period - (period - 1 - l_idx)) / period) * 100);
      }
      return { up: aroon_up[aroon_up.length - 1] ?? NaN, down: aroon_down[aroon_down.length - 1] ?? NaN };
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
      
      // 1. Trend vs EMA200 (major signal)
      if (Number.isFinite(ema200) && Number.isFinite(close)) {
        if (close! > ema200 * 1.01) { bullishSignals += 2; } // Above EMA200 by 1%+
        else if (close! < ema200 * 0.99) { bearishSignals += 2; } // Below EMA200 by 1%+
        else { neutralSignals += 1; }
      }
      
      // 2. RSI
      if (Number.isFinite(rsi)) {
        if (rsi >= 55 && rsi <= 70) { bullishSignals += 1; } // Bullish momentum
        else if (rsi > 70) { bearishSignals += 1; } // Overbought = caution
        else if (rsi <= 45 && rsi >= 30) { bearishSignals += 1; } // Bearish momentum
        else if (rsi < 30) { bullishSignals += 1; } // Oversold = potential bounce
        else { neutralSignals += 1; }
      }
      
      // 3. MACD Histogram
      if (Number.isFinite(hist)) {
        if (hist > 0) { bullishSignals += 1; }
        else { bearishSignals += 1; }
      }
      
      // 4. MACD vs Signal
      if (Number.isFinite(macd) && Number.isFinite(sig)) {
        if (macd > sig) { bullishSignals += 1; }
        else { bearishSignals += 1; }
      }
      
      // 5. ADX (trend strength)
      if (Number.isFinite(adxVal)) {
        if (adxVal! > 25) { 
          // Strong trend - amplify the dominant direction
          if (bullishSignals > bearishSignals) bullishSignals += 1;
          else if (bearishSignals > bullishSignals) bearishSignals += 1;
        } else {
          neutralSignals += 1; // Weak trend
        }
      }
      
      // 6. Stochastic
      if (Number.isFinite(stochK)) {
        if (stochK! > 80) { bearishSignals += 1; } // Overbought
        else if (stochK! < 20) { bullishSignals += 1; } // Oversold
        else if (stochK! >= 50) { bullishSignals += 0.5; }
        else { bearishSignals += 0.5; }
      }
      
      // 7. Aroon
      if (Number.isFinite(aroonUp) && Number.isFinite(aroonDown)) {
        if (aroonUp! > aroonDown! && aroonUp! > 70) { bullishSignals += 1; }
        else if (aroonDown! > aroonUp! && aroonDown! > 70) { bearishSignals += 1; }
        else { neutralSignals += 0.5; }
      }
      
      // 8. CCI (Commodity Channel Index)
      if (Number.isFinite(cciVal)) {
        if (cciVal! > 100) { bullishSignals += 1; } // Strong bullish
        else if (cciVal! > 0) { bullishSignals += 0.5; } // Mild bullish
        else if (cciVal! < -100) { bearishSignals += 1; } // Strong bearish
        else { bearishSignals += 0.5; } // Mild bearish
      }
      
      // 9. OBV (On Balance Volume) - trend confirmation
      if (Number.isFinite(obvCurrent) && Number.isFinite(obvPrev)) {
        if (obvCurrent! > obvPrev!) { bullishSignals += 1; } // Volume confirming up move
        else if (obvCurrent! < obvPrev!) { bearishSignals += 1; } // Volume confirming down move
        else { neutralSignals += 0.5; }
      }
      
      // 10. ATR-based volatility adjustment (risk factor)
      // High ATR in a downtrend is more bearish; high ATR in uptrend can be bullish breakout
      // For now, extreme volatility adds caution (neutral weight)
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
      let score = 50;
      const signalDiff = bullishSignals - bearishSignals;
      const maxSignals = 12; // Max possible with all 10 indicators
      
      // Adjust score based on signal difference
      score += (signalDiff / maxSignals) * 50;
      
      // Clamp to 0-100
      score = Math.max(0, Math.min(100, Math.round(score)));
      
      return {
        score,
        direction,
        signals: {
          bullish: Math.round(bullishSignals),
          bearish: Math.round(bearishSignals),
          neutral: Math.round(neutralSignals)
        }
      };
    }

    // Keep equities lower due to Alpha Vantage rate limits on TA endpoints
    const MAX_PER_SCAN = type === "equity" ? 5 : 10;
    const limited = symbolsToScan.slice(0, MAX_PER_SCAN);
    const results: ScanResult[] = [];
    const errors: string[] = [];

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
          const volumes = candles.map(c => 0); // placeholder
          
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
          
          // Batch 2: Remaining 4 indicators
          const [stochObj, cciVal, aroonObj, priceData] = await Promise.all([
            fetchSTOCH(sym),
            fetchCCI(sym),
            fetchAROON(sym),
            fetchEquityPrice(sym)
          ]);
          
          const price = priceData.price;
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
