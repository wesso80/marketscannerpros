import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALPHA_KEY = process.env.ALPHA_VANTAGE_API_KEY;

// Asset lists for scanning - expanded for better variety
const EQUITY_SYMBOLS = [
  // Mega caps
  "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "AVGO", "LLY", "JPM",
  // Large caps
  "V", "UNH", "XOM", "MA", "HD", "PG", "JNJ", "COST", "MRK", "ABBV",
  // Growth & Tech
  "AMD", "CRM", "ADBE", "NFLX", "ORCL", "QCOM", "INTC", "AMAT", "PANW", "SNOW"
];

const CRYPTO_SYMBOLS = [
  // Top 10
  "BTC", "ETH", "BNB", "SOL", "XRP",
  "ADA", "DOGE", "AVAX", "DOT", "MATIC",
  // Alt coins
  "LINK", "UNI", "ATOM", "LTC", "FIL",
  "NEAR", "APT", "ARB", "OP", "INJ"
];

// Use commodity ETFs instead of premium commodity API
const COMMODITY_ETFS = [
  { symbol: "GLD", name: "Gold" },
  { symbol: "USO", name: "Oil" },
  { symbol: "SLV", name: "Silver" },
  { symbol: "UNG", name: "Natural Gas" },
  { symbol: "COPX", name: "Copper" }
];

type Candle = { t: string; open: number; high: number; low: number; close: number };

interface Candidate {
  assetClass: "equity" | "crypto" | "commodity";
  symbol: string;
  name?: string;
  venue?: string;
  score: number;
  scannerPayload: {
    price: number;
    rsi: number;
    macdHist: number;
    ema200: number;
    atr: number;
    phase: string;
    structure: string;
    risk: string;
    trend: string;
    momentum: string;
  };
  keyLevels?: { support?: number; resistance?: number };
  risks?: string[];
}

// Fetch helper with rate limit handling
async function fetchAlphaJson(url: string, tag: string): Promise<any> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Alpha Vantage HTTP ${res.status} for ${tag}`);
  const json = await res.json();
  if (json.Note || json.Information) throw new Error(`Rate limit: ${json.Note || json.Information}`);
  if (json["Error Message"]) throw new Error(`API error: ${json["Error Message"]}`);
  return json;
}

// ============ INDICATOR CALCULATIONS ============
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
    const ch = values[i] - values[i - 1];
    if (ch >= 0) gains += ch; else losses -= ch;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  out[period] = 100 - (100 / (1 + (avgGain / (avgLoss || 1e-9))));
  for (let i = period + 1; i < values.length; i++) {
    const ch = values[i] - values[i - 1];
    const gain = Math.max(0, ch);
    const loss = Math.max(0, -ch);
    avgGain = ((avgGain * (period - 1)) + gain) / period;
    avgLoss = ((avgLoss * (period - 1)) + loss) / period;
    out[i] = 100 - (100 / (1 + (avgGain / (avgLoss || 1e-9))));
  }
  return out;
}

function macd(values: number[], fast = 12, slow = 26, signal = 9) {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine = emaFast.map((v, i) => v - (emaSlow[i] ?? v));
  const signalLine = ema(macdLine, signal);
  const hist = macdLine.map((v, i) => v - (signalLine[i] ?? v));
  return { macdLine, signalLine, hist };
}

function atr(highs: number[], lows: number[], closes: number[], period = 14): number[] {
  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const h = highs[i], l = lows[i], pc = closes[i - 1];
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

// ============ DATA FETCHERS ============
async function fetchEquityDaily(symbol: string): Promise<Candle[]> {
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=compact&apikey=${ALPHA_KEY}`;
  const j = await fetchAlphaJson(url, `EQUITY_DAILY ${symbol}`);
  const ts = j["Time Series (Daily)"] || {};
  return Object.entries(ts).map(([date, v]: any) => ({
    t: date,
    open: Number(v["1. open"]),
    high: Number(v["2. high"]),
    low: Number(v["3. low"]),
    close: Number(v["4. close"]),
  })).filter(c => Number.isFinite(c.close)).sort((a, b) => a.t.localeCompare(b.t));
}

async function fetchCryptoDaily(symbol: string): Promise<Candle[]> {
  const url = `https://www.alphavantage.co/query?function=DIGITAL_CURRENCY_DAILY&symbol=${symbol}&market=USD&apikey=${ALPHA_KEY}`;
  const j = await fetchAlphaJson(url, `CRYPTO_DAILY ${symbol}`);
  const ts = j["Time Series (Digital Currency Daily)"] || {};
  return Object.entries(ts).map(([date, v]: any) => ({
    t: date,
    open: Number(v["1a. open (USD)"] ?? v["1. open"]),
    high: Number(v["2a. high (USD)"] ?? v["2. high"]),
    low: Number(v["3a. low (USD)"] ?? v["3. low"]),
    close: Number(v["4a. close (USD)"] ?? v["4. close"]),
  })).filter(c => Number.isFinite(c.close)).sort((a, b) => a.t.localeCompare(b.t));
}

// Commodity ETFs use the same equity API
async function fetchCommodityETF(symbol: string): Promise<Candle[]> {
  return fetchEquityDaily(symbol);
}

// ============ SCORING & PHASE LOGIC ============
function computeIndicators(candles: Candle[]) {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  
  const rsiArr = rsi(closes, 14);
  const macdData = macd(closes);
  const ema200Arr = ema(closes, 200);
  const ema50Arr = ema(closes, 50);
  const ema20Arr = ema(closes, 20);
  const atrArr = atr(highs, lows, closes, 14);

  const last = candles.length - 1;
  return {
    price: closes[last],
    rsi: rsiArr[last] ?? 50,
    macdHist: macdData.hist[last] ?? 0,
    macdLine: macdData.macdLine[last] ?? 0,
    signalLine: macdData.signalLine[last] ?? 0,
    ema200: ema200Arr[last] ?? closes[last],
    ema50: ema50Arr[last] ?? closes[last],
    ema20: ema20Arr[last] ?? closes[last],
    atr: atrArr[last - 1] ?? 0, // ATR array is offset by 1
    prevClose: closes[last - 1] ?? closes[last],
  };
}

function determinePhase(ind: ReturnType<typeof computeIndicators>): string {
  const { price, ema20, ema50, ema200, rsi, macdHist } = ind;
  
  // Bullish: Price > all EMAs, EMAs stacked bullish, RSI > 50, MACD positive
  if (price > ema200 && price > ema50 && price > ema20 && ema20 > ema50 && ema50 > ema200 && rsi > 50 && macdHist > 0) {
    return "Bullish Expansion";
  }
  
  // Early Bullish: Price reclaiming EMAs
  if (price > ema200 && price > ema50 && macdHist > 0 && rsi > 45) {
    return "Bullish Recovery";
  }
  
  // Bearish: Price < all EMAs, EMAs stacked bearish
  if (price < ema200 && price < ema50 && price < ema20 && ema20 < ema50 && ema50 < ema200 && rsi < 50 && macdHist < 0) {
    return "Bearish Expansion";
  }
  
  // Consolidation: Price between EMAs, low momentum
  if (Math.abs(macdHist) < 0.01 * price || (rsi > 40 && rsi < 60)) {
    return "Consolidation";
  }
  
  // Default based on price vs EMA200
  return price > ema200 ? "Bullish Phase" : "Bearish Phase";
}

function determineStructure(ind: ReturnType<typeof computeIndicators>): string {
  const { price, ema20, ema50, ema200 } = ind;
  
  if (ema20 > ema50 && ema50 > ema200 && price > ema20) return "Strong Uptrend";
  if (ema20 < ema50 && ema50 < ema200 && price < ema20) return "Strong Downtrend";
  if (Math.abs(ema20 - ema50) / ema50 < 0.02) return "Range-Bound";
  return price > ema50 ? "Upward Bias" : "Downward Bias";
}

function determineRisk(ind: ReturnType<typeof computeIndicators>): string {
  const { rsi, atr, price, prevClose } = ind;
  const volatility = (atr / price) * 100;
  
  if (rsi > 70) return "Overbought - Pullback Risk";
  if (rsi < 30) return "Oversold - Bounce Likely";
  if (volatility > 5) return "High Volatility";
  if (Math.abs(price - prevClose) / prevClose > 0.05) return "Extended Move";
  return "Normal Range";
}

function computeScore(ind: ReturnType<typeof computeIndicators>): number {
  let score = 50; // Base score
  
  const { price, ema200, ema50, ema20, rsi, macdHist, macdLine, signalLine } = ind;
  
  // Trend alignment (+/- 15 points)
  if (price > ema200) score += 5;
  if (price > ema50) score += 5;
  if (ema50 > ema200) score += 5;
  
  // RSI conditions (+/- 15 points)
  if (rsi > 50 && rsi < 70) score += 10; // Healthy bullish
  if (rsi > 30 && rsi < 50) score -= 5; // Weak
  if (rsi >= 70) score += 5; // Strong momentum but risky
  if (rsi <= 30) score -= 10; // Oversold
  
  // MACD conditions (+/- 15 points)
  if (macdHist > 0) score += 10;
  if (macdLine > signalLine) score += 5;
  
  // Clamp score
  return Math.max(0, Math.min(100, Math.round(score)));
}

async function analyzeAsset(
  symbol: string,
  assetClass: "equity" | "crypto" | "commodity",
  fetchFn: (s: string) => Promise<Candle[]>
): Promise<Candidate | null> {
  try {
    const candles = await fetchFn(symbol);
    if (candles.length < 50) return null;
    
    const ind = computeIndicators(candles);
    const score = computeScore(ind);
    const phase = determinePhase(ind);
    const structure = determineStructure(ind);
    const risk = determineRisk(ind);
    
    // Trend direction
    const trend = ind.price > ind.ema200 ? "Bullish" : "Bearish";
    const momentum = ind.macdHist > 0 ? "Positive" : "Negative";
    
    // Key levels (simple approximation)
    const recentLows = candles.slice(-20).map(c => c.low);
    const recentHighs = candles.slice(-20).map(c => c.high);
    const support = Math.min(...recentLows);
    const resistance = Math.max(...recentHighs);
    
    // Risks array
    const risks: string[] = [];
    if (ind.rsi > 70) risks.push("Overbought conditions");
    if (ind.rsi < 30) risks.push("Oversold - watch for reversal");
    if ((ind.atr / ind.price) > 0.03) risks.push("Elevated volatility");
    if (risks.length === 0) risks.push("Normal market conditions");
    
    return {
      assetClass,
      symbol,
      name: symbol,
      venue: assetClass === "equity" ? "NYSE/NASDAQ" : assetClass === "crypto" ? "Global Crypto" : "Commodities",
      score,
      scannerPayload: {
        price: Math.round(ind.price * 100) / 100,
        rsi: Math.round(ind.rsi * 10) / 10,
        macdHist: Math.round(ind.macdHist * 1000) / 1000,
        ema200: Math.round(ind.ema200 * 100) / 100,
        atr: Math.round(ind.atr * 100) / 100,
        phase,
        structure,
        risk,
        trend,
        momentum,
      },
      keyLevels: { support: Math.round(support * 100) / 100, resistance: Math.round(resistance * 100) / 100 },
      risks,
    };
  } catch (err: any) {
    console.error(`[market-focus] Error analyzing ${assetClass} ${symbol}:`, err?.message);
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const assetClass = searchParams.get("assetClass") as "equity" | "crypto" | "commodity" | null;

  if (!ALPHA_KEY) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  try {
    let candidates: Candidate[] = [];

    if (!assetClass || assetClass === "equity") {
      // Shuffle and scan 10 equities for variety
      const shuffled = [...EQUITY_SYMBOLS].sort(() => Math.random() - 0.5);
      const symbols = shuffled.slice(0, 10);
      console.log(`[market-focus] Scanning equities: ${symbols.join(", ")}`);
      const results = await Promise.all(
        symbols.map(s => analyzeAsset(s, "equity", fetchEquityDaily))
      );
      candidates.push(...results.filter(Boolean) as Candidate[]);
    }

    if (!assetClass || assetClass === "crypto") {
      // Shuffle and scan 10 cryptos for variety
      const shuffled = [...CRYPTO_SYMBOLS].sort(() => Math.random() - 0.5);
      const symbols = shuffled.slice(0, 10);
      console.log(`[market-focus] Scanning crypto: ${symbols.join(", ")}`);
      const results = await Promise.all(
        symbols.map(s => analyzeAsset(s, "crypto", fetchCryptoDaily))
      );
      const validCrypto = results.filter(Boolean) as Candidate[];
      console.log(`[market-focus] Got ${validCrypto.length} valid crypto candidates`);
      candidates.push(...validCrypto);
    }

    if (!assetClass || assetClass === "commodity") {
      // Use commodity ETFs with equity API (GLD, USO, etc.)
      const etfs = COMMODITY_ETFS.slice(0, 5);
      console.log(`[market-focus] Scanning commodities: ${etfs.map(e => e.symbol).join(", ")}`);
      const results = await Promise.all(
        etfs.map(e => analyzeAsset(e.symbol, "commodity", fetchCommodityETF))
      );
      candidates.push(...results.filter(Boolean) as Candidate[]);
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    // If filtering by asset class, return just those
    if (assetClass) {
      candidates = candidates.filter(c => c.assetClass === assetClass);
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      count: candidates.length,
      candidates,
    });
  } catch (err: any) {
    console.error("[market-focus] Error:", err);
    return NextResponse.json({ error: err?.message || "Failed to fetch candidates" }, { status: 500 });
  }
}
