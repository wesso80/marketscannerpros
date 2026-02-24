import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth";
import { scannerLimiter, getClientIP } from "@/lib/rateLimit";
import { avCircuit } from "@/lib/circuitBreaker";
import { avTakeToken } from "@/lib/avRateGovernor";
import { shouldUseCache, canFallbackToAV, getCacheMode } from "@/lib/cacheMode";
import { getCachedScanData, getBulkCachedScanData, CachedScanData } from "@/lib/scannerCache";
import { recordSignalsBatch, RecordSignalParams } from "@/lib/signalRecorder";
import { getRuntimeRiskSnapshotInput } from "@/lib/risk/runtimeSnapshot";
import { buildPermissionSnapshot } from "@/lib/risk-governor-hard";
import { getAdaptiveLayer } from "@/lib/adaptiveTrader";
import { computeInstitutionalFilter, inferStrategyFromText } from "@/lib/institutionalFilter";
import { computeCapitalFlowEngine } from "@/lib/capitalFlowEngine";
import { getDerivativesForSymbols, getGlobalData, getOHLC, resolveSymbolToId } from "@/lib/coingecko";
import { classifyRegime } from "@/lib/regime-classifier";
import { estimateComponentsFromContext, computeRegimeScore, deriveRegimeConfidence } from "@/lib/ai/regimeScoring";
import { computeACLFromScoring } from "@/lib/ai/adaptiveConfidenceLens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // Disable static optimization
export const revalidate = 0; // Disable ISR caching

// Scanner API - CoinGecko commercial feed for crypto
// Equity & Forex require commercial data licenses - admin-only testing with Alpha Vantage
// v3.0 - Added cache mode support for reduced AV calls
const SCANNER_VERSION = 'v3.0';
const ALPHA_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const STABLECOIN_SYMBOLS = new Set([
  'USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'USDP', 'GUSD', 'FRAX', 'LUSD', 'SUSD', 'USDD', 'FDUSD', 'PYUSD', 'USDE'
]);

function normalizeCryptoSymbol(symbol: string): string {
  return String(symbol || '').replace(/[-]?(USD|USDT)$/i, '').toUpperCase();
}

function isStablecoinSymbol(symbol: string): boolean {
  return STABLECOIN_SYMBOLS.has(normalizeCryptoSymbol(symbol));
}

// Friendly handler for Alpha Vantage throttling/premium notices
// Wrapped in circuit breaker to prevent cascading failures
async function fetchAlphaJson(url: string, tag: string) {
  await avTakeToken();
  return avCircuit.call(async () => {
  // Add cache-busting timestamp
  const cacheBustUrl = url + (url.includes('?') ? '&' : '?') + `_nocache=${Date.now()}`;
  console.info(`[AV] Fetching ${tag}: ${url.substring(0, 100)}...`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000); // 15s hard timeout
  
  let res: Response;
  try {
    res = await fetch(cacheBustUrl, { 
      next: { revalidate: 0 }, 
      cache: "no-store",
      signal: controller.signal,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
      }
    });
  } catch (err: unknown) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      console.error(`[AV] Timeout after 15s for ${tag}`);
      throw new Error(`Alpha Vantage timeout during ${tag}`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
  
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
  }); // end avCircuit.call
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
  oiChangePercent?: number;    // 5m OI change percent
  basisPercent?: number;       // Perp basis vs index/spot
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
  // Computed trade setup fields (populated by both cached and AV paths)
  confidence?: number;
  setup?: string;
  entry?: number;
  stop?: number;
  target?: number;
  rMultiple?: number;
  // Chart data for visualization
  chartData?: {
    candles: { t: string; o: number; h: number; l: number; c: number }[];
    ema200: number[];
    rsi: number[];
    macd: { macd: number; signal: number; hist: number }[];
  };
  // Derivatives data for crypto (OI, Funding Rate, L/S)
  derivatives?: DerivativesData;
  capitalFlow?: any;
}

// Fetch derivatives data from CoinGecko commercial derivatives endpoint
async function fetchCryptoDerivatives(symbol: string): Promise<DerivativesData | null> {
  try {
    const baseSymbol = symbol.replace(/[-]?(USD|USDT)$/i, '').toUpperCase();
    const source = await getDerivativesForSymbols([baseSymbol]);
    if (!source.length) return null;

    const best = [...source].sort((a, b) => (b.volume_24h || 0) - (a.volume_24h || 0))[0];
    const markPrice = Number(best.price || 0);
    const openInterestUsd = Number(best.open_interest || 0);
    const openInterestCoin = markPrice > 0 ? openInterestUsd / markPrice : 0;
    const fundingRate = Number.isFinite(best.funding_rate) ? best.funding_rate * 100 : undefined;
    const basisPercent = Number.isFinite(best.basis) && Number.isFinite(best.index) && best.index > 0
      ? (best.basis / best.index) * 100
      : undefined;

    if (!Number.isFinite(openInterestUsd) || openInterestUsd <= 0) return null;

    return {
      openInterest: openInterestUsd,
      openInterestCoin,
      fundingRate,
      longShortRatio: undefined,
      oiChangePercent: undefined,
      basisPercent,
    };
  } catch (err) {
    console.warn('[scanner] Failed to fetch derivatives for', symbol, err);
    return null;
  }
}

function inferStructureHigherHighs(candles: Array<{ h?: number; l?: number; c?: number }>): boolean {
  if (!candles.length) return false;
  const recent = candles.slice(-12);
  if (recent.length < 4) return false;
  const highs = recent.map((c) => Number(c.h)).filter(Number.isFinite);
  const lows = recent.map((c) => Number(c.l)).filter(Number.isFinite);
  if (highs.length < 4 || lows.length < 4) return false;
  const firstHigh = highs.slice(0, Math.floor(highs.length / 2));
  const secondHigh = highs.slice(Math.floor(highs.length / 2));
  const firstLow = lows.slice(0, Math.floor(lows.length / 2));
  const secondLow = lows.slice(Math.floor(lows.length / 2));
  return (Math.max(...secondHigh) > Math.max(...firstHigh)) && (Math.min(...secondLow) > Math.min(...firstLow));
}

function buildScannerLiquidityLevels(
  candles: Array<{ t: string; o: number; h: number; l: number; c: number; volume?: number }> | undefined,
  spot: number
): { levels: Array<{ level: number; label: string }>; vwap?: number; structureHigherHighs: boolean } {
  if (!candles || candles.length === 0 || !Number.isFinite(spot)) {
    return { levels: [], structureHigherHighs: false };
  }

  const sorted = [...candles].sort((a, b) => a.t.localeCompare(b.t));
  const recent = sorted.slice(-96);
  const levels: Array<{ level: number; label: string }> = [];

  const byDay = new Map<string, typeof recent>();
  for (const candle of recent) {
    const key = candle.t.slice(0, 10);
    const bucket = byDay.get(key) ?? [];
    bucket.push(candle);
    byDay.set(key, bucket);
  }
  const dayKeys = Array.from(byDay.keys()).sort();
  const latestDayKey = dayKeys[dayKeys.length - 1];
  const prevDayKey = dayKeys[dayKeys.length - 2];

  if (prevDayKey) {
    const prevDay = byDay.get(prevDayKey) || [];
    if (prevDay.length) {
      levels.push({ level: Math.max(...prevDay.map((c) => c.h)), label: 'PDH' });
      levels.push({ level: Math.min(...prevDay.map((c) => c.l)), label: 'PDL' });
    }
  }

  if (latestDayKey) {
    const latestDay = byDay.get(latestDayKey) || [];
    const overnight = latestDay.filter((c) => {
      const hour = Number(c.t.slice(11, 13));
      return Number.isFinite(hour) && hour < 9;
    });
    if (overnight.length) {
      levels.push({ level: Math.max(...overnight.map((c) => c.h)), label: 'ONH' });
      levels.push({ level: Math.min(...overnight.map((c) => c.l)), label: 'ONL' });
    }
  }

  const week = recent.slice(-35);
  if (week.length) {
    levels.push({ level: Math.max(...week.map((c) => c.h)), label: 'WEEK_HIGH' });
    levels.push({ level: Math.min(...week.map((c) => c.l)), label: 'WEEK_LOW' });
  }

  for (let i = 0; i < recent.length - 1; i += 1) {
    const current = recent[i];
    const next = recent[i + 1];
    const eqh = Math.abs(current.h - next.h) / Math.max(0.0001, current.h);
    const eql = Math.abs(current.l - next.l) / Math.max(0.0001, current.l);
    if (eqh <= 0.0015) levels.push({ level: (current.h + next.h) / 2, label: 'EQH' });
    if (eql <= 0.0015) levels.push({ level: (current.l + next.l) / 2, label: 'EQL' });
  }

  const sumPv = recent.reduce((acc, bar) => acc + (((bar.h + bar.l + bar.c) / 3) * Math.max(1, bar.volume ?? 1)), 0);
  const sumVol = recent.reduce((acc, bar) => acc + Math.max(1, bar.volume ?? 1), 0);
  const vwap = sumVol > 0 ? sumPv / sumVol : undefined;

  const roundLevel = spot >= 1000 ? Math.round(spot / 100) * 100 : spot >= 100 ? Math.round(spot / 10) * 10 : spot >= 10 ? Math.round(spot) : Number((Math.round(spot * 10) / 10).toFixed(1));
  levels.push({ level: roundLevel, label: 'ROUND' });

  const structureHigherHighs = inferStructureHigherHighs(recent);

  return {
    levels,
    vwap,
    structureHigherHighs,
  };
}

export async function POST(req: NextRequest) {
  console.info(`[scanner] VERSION: ${SCANNER_VERSION} - stablecoins excluded`);
  try {
    // Rate limit check
    const ip = getClientIP(req);
    const rl = scannerLimiter.check(ip);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many scanner requests. Please wait before scanning again.', retryAfter: rl.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } }
      );
    }

    // Auth check - require valid session to use scanner
    // Allow internal cron jobs to bypass auth via x-cron-secret header
    const cronSecret = process.env.CRON_SECRET;
    const headerCronSecret = req.headers.get('x-cron-secret');
    const isCronBypass = cronSecret && headerCronSecret === cronSecret;

    const session = isCronBypass
      ? { workspaceId: 'system-cron', tier: 'pro_trader' as const, cid: 'system' }
      : await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json(
        { error: "Please log in to use the scanner" },
        { status: 401 }
      );
    }

    // ─── Risk Governor awareness ───
    // Fetch current risk state so we can tag results with regime context
    let riskSnapshot: ReturnType<typeof buildPermissionSnapshot> | null = null;
    try {
      const riskInput = await getRuntimeRiskSnapshotInput(session.workspaceId);
      const guardCookie = req.cookies.get('msp_risk_guard')?.value;
      riskSnapshot = buildPermissionSnapshot({
        enabled: guardCookie !== 'off',
        ...riskInput,
      });
    } catch (riskErr) {
      console.warn('[scanner] Risk governor lookup failed, continuing without regime:', riskErr);
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

    // Normalize crypto symbols and exclude stablecoins from scan universe.
    if (type === "crypto") {
      const originalCount = symbolsToScan.length;
      symbolsToScan = symbolsToScan
        .map((s) => normalizeCryptoSymbol(s))
        .filter((s) => !!s && !isStablecoinSymbol(s));

      if (symbolsToScan.length !== originalCount) {
        console.info(`[scanner] filtered ${originalCount - symbolsToScan.length} stablecoin symbol(s) from request`);
      }

      if (symbolsToScan.length === 0) {
        return NextResponse.json(
          { error: 'No non-stable crypto symbols to scan' },
          { status: 400 }
        );
      }
    }
    // Commodity symbols unsupported in this endpoint (no intraday); ignore mapping

    // Check API keys based on market type
    if (type === "crypto") {
      // Crypto uses CoinGecko commercial feed
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
      const url = `https://www.alphavantage.co/query?function=RSI&symbol=${encodeURIComponent(sym)}&interval=${avInterval}&time_period=14&series_type=close&entitlement=realtime&apikey=${ALPHA_KEY}`;
      const j = await fetchAlphaJson(url, `RSI ${sym}`);
      const ta = j["Technical Analysis: RSI"] || {};
      const first = Object.values(ta)[0] as any;
      console.debug("[scanner] RSI", { sym, avInterval, hasTA: !!first });
      return first ? Number(first?.RSI) : NaN;
    }

    async function fetchMACD(sym: string) {
      const url = `https://www.alphavantage.co/query?function=MACD&symbol=${encodeURIComponent(sym)}&interval=${avInterval}&series_type=close&entitlement=realtime&apikey=${ALPHA_KEY}`;
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
      const url = `https://www.alphavantage.co/query?function=EMA&symbol=${encodeURIComponent(sym)}&interval=${avInterval}&time_period=200&series_type=close&entitlement=realtime&apikey=${ALPHA_KEY}`;
      const j = await fetchAlphaJson(url, `EMA200 ${sym}`);
      const ta = j["Technical Analysis: EMA"] || {};
      const first = Object.values(ta)[0] as any;
      console.debug("[scanner] EMA200", { sym, avInterval, hasTA: !!first });
      return first ? Number(first?.EMA) : NaN;
    }

    async function fetchATR(sym: string) {
      const url = `https://www.alphavantage.co/query?function=ATR&symbol=${encodeURIComponent(sym)}&interval=${avInterval}&time_period=14&entitlement=realtime&apikey=${ALPHA_KEY}`;
      const j = await fetchAlphaJson(url, `ATR ${sym}`);
      const ta = j["Technical Analysis: ATR"] || {};
      const first = Object.values(ta)[0] as any;
      console.debug("[scanner] ATR", { sym, avInterval, hasTA: !!first });
      return first ? Number(first?.ATR) : NaN;
    }

    async function fetchADX(sym: string) {
      const url = `https://www.alphavantage.co/query?function=ADX&symbol=${encodeURIComponent(sym)}&interval=${avInterval}&time_period=14&entitlement=realtime&apikey=${ALPHA_KEY}`;
      const j = await fetchAlphaJson(url, `ADX ${sym}`);
      const ta = j["Technical Analysis: ADX"] || {};
      const first = Object.values(ta)[0] as any;
      console.debug("[scanner] ADX", { sym, avInterval, hasTA: !!first });
      return { adx: first ? Number(first?.ADX) : NaN };
    }

    async function fetchSTOCH(sym: string) {
      const url = `https://www.alphavantage.co/query?function=STOCH&symbol=${encodeURIComponent(sym)}&interval=${avInterval}&entitlement=realtime&apikey=${ALPHA_KEY}`;
      const j = await fetchAlphaJson(url, `STOCH ${sym}`);
      const ta = j["Technical Analysis: STOCH"] || {};
      const first = Object.values(ta)[0] as any;
      console.debug("[scanner] STOCH", { sym, avInterval, hasTA: !!first });
      return { k: first ? Number(first?.SlowK) : NaN, d: first ? Number(first?.SlowD) : NaN };
    }

    async function fetchCCI(sym: string) {
      const url = `https://www.alphavantage.co/query?function=CCI&symbol=${encodeURIComponent(sym)}&interval=${avInterval}&time_period=20&entitlement=realtime&apikey=${ALPHA_KEY}`;
      const j = await fetchAlphaJson(url, `CCI ${sym}`);
      const ta = j["Technical Analysis: CCI"] || {};
      const first = Object.values(ta)[0] as any;
      console.debug("[scanner] CCI", { sym, avInterval, hasTA: !!first });
      return first ? Number(first?.CCI) : NaN;
    }

    async function fetchAROON(sym: string) {
      const url = `https://www.alphavantage.co/query?function=AROON&symbol=${encodeURIComponent(sym)}&interval=${avInterval}&time_period=25&entitlement=realtime&apikey=${ALPHA_KEY}`;
      const j = await fetchAlphaJson(url, `AROON ${sym}`);
      const ta = j["Technical Analysis: AROON"] || {};
      const first = Object.values(ta)[0] as any;
      console.debug("[scanner] AROON", { sym, avInterval, hasTA: !!first });
      return { up: first ? Number(first?.["Aroon Up"]) : NaN, down: first ? Number(first?.["Aroon Down"]) : NaN };
    }

    async function fetchEquityPrice(sym: string) {
      const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(sym)}&entitlement=realtime&apikey=${ALPHA_KEY}`;
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
        const url = `https://www.alphavantage.co/query?function=REALTIME_BULK_QUOTES&symbol=${encodeURIComponent(symbolList)}&entitlement=realtime&apikey=${ALPHA_KEY}`;
        
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

    // USDT Dominance from CoinGecko global market cap percentages
    async function fetchUSDTDominance(timeframe: string): Promise<Candle[]> {
      try {
        console.info(`[scanner] Fetching USDT dominance from CoinGecko global data...`);
        const global = await getGlobalData();
        const usdtDominance = Number(global?.market_cap_percentage?.usdt || 0);
        if (!Number.isFinite(usdtDominance) || usdtDominance <= 0) {
          throw new Error('CoinGecko global dominance unavailable');
        }
        
        // Return single-point candle array for USDT dominance — NO synthetic history.
        // Previous implementation used Math.random() which made all TA indicators meaningless.
        // USDT.D is a macro-level metric, not a chartable instrument.
        const now = Date.now();
        const candles: Candle[] = [{
          t: new Date(now).toISOString(),
          open: usdtDominance,
          high: usdtDominance,
          low: usdtDominance,
          close: usdtDominance,
          volume: 0,
        }];
        
        console.info(`[scanner] USDT Dominance (CoinGecko): Generated ${candles.length} candles, current: ${usdtDominance.toFixed(2)}%`);
        return candles;
        
      } catch (err: any) {
        console.error('[scanner] USDT dominance fetch error:', err.message);
        throw new Error('USDT dominance data temporarily unavailable');
      }
    }

    // CoinGecko OHLC candles (commercial plan)
    async function fetchCryptoCoinGecko(symbol: string, timeframe: string): Promise<Candle[]> {
      console.info(`[scanner] fetchCryptoCoinGecko called with symbol=${symbol}, timeframe=${timeframe}`);
      
      const baseSymbol = symbol.replace(/-USD$/, '').toUpperCase();
      
      const days = timeframe === '1d' || timeframe === 'daily'
        ? 30
        : timeframe === '4h' || timeframe === '4hour'
          ? 7
          : 1;
      
      // Skip other stablecoins - they don't have trading pairs
      const stablecoins = ['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'USDP', 'GUSD', 'FRAX', 'LUSD', 'SUSD', 'USDD', 'FDUSD', 'PYUSD', 'USDE'];
      if (stablecoins.includes(baseSymbol)) {
        console.warn(`[scanner v2.4] ${baseSymbol} is a stablecoin - skipping`);
        throw new Error(`${baseSymbol} is a stablecoin (pegged to $1) - technical analysis not applicable`);
      }
      
      const coinId = await resolveSymbolToId(baseSymbol);
      if (!coinId) {
        throw new Error(`No CoinGecko mapping for ${baseSymbol}`);
      }

      const ohlc = await getOHLC(coinId, days as 1 | 7 | 14 | 30 | 90 | 180 | 365);
      if (!ohlc || ohlc.length === 0) {
        throw new Error(`No CoinGecko OHLC data for ${baseSymbol}`);
      }

      const candles: Candle[] = ohlc
        .map((row: number[]) => ({
          t: new Date(row[0]).toISOString(),
          open: Number(row[1]),
          high: Number(row[2]),
          low: Number(row[3]),
          close: Number(row[4]),
          volume: 0,
        }))
        .filter((c: Candle) => Number.isFinite(c.close))
        .sort((a, b) => a.t.localeCompare(b.t));

      console.info(`[scanner] CoinGecko ${baseSymbol}: ${candles.length} candles`);
      return candles;
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
      
      // Determine direction based on signal counts (1.15x threshold for sensitive detection)
      let direction: 'bullish' | 'bearish' | 'neutral';
      if (bullishSignals > bearishSignals * 1.15) {
        direction = 'bullish';
      } else if (bearishSignals > bullishSignals * 1.15) {
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
          const baseSym = sym;
          
          // CoinGecko-only crypto candles (commercial license)
          let candles: Candle[];
          try {
            candles = await fetchCryptoCoinGecko(baseSym, timeframe);
          } catch (cgErr: any) {
            errors.push(`${baseSym}: ${cgErr.message}`);
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
            symbol: `${baseSym}-USD`,
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
                  openInterest: Number.isFinite(derivData.openInterest) && derivData.openInterest > 0
                    ? derivData.openInterest
                    : derivData.openInterestCoin * price,
                  openInterestCoin: derivData.openInterestCoin,
                  fundingRate: derivData.fundingRate,
                  longShortRatio: derivData.longShortRatio,
                  oiChangePercent: derivData.oiChangePercent,
                  basisPercent: derivData.basisPercent,
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
          
          // Find the time series data (AV returns dynamic intraday key, e.g. "Time Series FX (60min)")
          const foundKey = Object.keys(j).find((k) =>
            k === tsKey ||
            k.startsWith("Time Series FX (")
          );
          const ts = (foundKey ? j[foundKey] : undefined) || {};
          
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
          // EQUITIES: Try cached data first, fall back to Alpha Vantage
          // v3.0: Cache mode support - reduces AV calls by ~90%
          
          const useCache = shouldUseCache();
          let cachedData: CachedScanData | null = null;
          
          if (useCache) {
            cachedData = await getCachedScanData(sym);
          }
          
          if (cachedData) {
            // Use cached data - no AV calls needed!
            console.info(`[scanner] EQUITY ${sym} served from ${cachedData.source} (${getCacheMode()} mode) - 0 AV calls`);
            
            const price = cachedData.price;
            const rsiVal = cachedData.rsi;
            const macHist = cachedData.macdHist;
            const macLine = cachedData.macdLine;
            const sigLine = cachedData.macdSignal;
            const ema200Val = cachedData.ema200;
            const atrVal = cachedData.atr;
            const adxVal = cachedData.adx;
            const stochK = cachedData.stochK;
            const stochD = cachedData.stochD;
            const cciVal = cachedData.cci;
            
            // Aroon from cache (added to cache pipeline) — fall back to computed estimate
            const aroonUp = cachedData.aroonUp ?? NaN;
            const aroonDown = cachedData.aroonDown ?? NaN;
            
            const scoreResult = computeScore(price, ema200Val, rsiVal, macLine, sigLine, macHist, atrVal, adxVal, stochK, aroonUp, aroonDown, cciVal, 0, 0);

            // Compute trade setup fields from cached data (same logic as useTickerData fallbacks, but server-side)
            const dirLabel = scoreResult.direction === 'bearish' ? 'SHORT' : 'LONG';
            const atrSafe = Number.isFinite(atrVal) ? atrVal : price * 0.02; // Fallback: 2% of price if ATR missing
            const entryPrice = price;
            const stopPrice = dirLabel === 'LONG' ? price - atrSafe * 1.5 : price + atrSafe * 1.5;
            const targetPrice = dirLabel === 'LONG' ? price + atrSafe * 3 : price - atrSafe * 3;
            const riskPerUnit = Math.abs(entryPrice - stopPrice);
            const rMultipleCalc = riskPerUnit > 0 ? Math.abs(targetPrice - entryPrice) / riskPerUnit : 0;
            const confidenceCalc = Math.min(99, Math.abs(scoreResult.score));
            const setupLabel = `${scoreResult.signals.bullish}B/${scoreResult.signals.bearish}Be signals`;

            const item: ScanResult & { direction?: string; signals?: any } = {
              symbol: sym,
              score: scoreResult.score,
              direction: scoreResult.direction,
              signals: scoreResult.signals,
              confidence: confidenceCalc,
              setup: setupLabel,
              entry: entryPrice,
              stop: Math.max(0, stopPrice),
              target: Math.max(0, targetPrice),
              rMultiple: Math.round(rMultipleCalc * 10) / 10,
              timeframe,
              type,
              price,
              rsi: rsiVal,
              macd_hist: macHist,
              ema200: ema200Val,
              atr: atrVal,
              adx: adxVal,
              stoch_k: stochK,
              stoch_d: stochD,
              cci: cciVal,
              aroon_up: aroonUp,
              aroon_down: aroonDown,
              obv: NaN,
              lastCandleTime: new Date().toISOString(),
            };
            if (scoreResult.score >= (Number.isFinite(minScore) ? minScore : 0)) results.push(item); else if (!results.length) results.push(item);
            
          } else if (canFallbackToAV()) {
            // Fallback to Alpha Vantage with ONE candle-series call, then compute indicators locally.
            // This avoids per-indicator API fanout and dramatically reduces rate-limit failures.
            console.info(`[scanner] Fetching EQUITY ${sym} via Alpha Vantage candles (${avInterval}) - ${getCacheMode()} mode`);

            const seriesUrl = avInterval === "daily"
              ? `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(sym)}&outputsize=full&entitlement=realtime&apikey=${ALPHA_KEY}`
              : `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${encodeURIComponent(sym)}&interval=${avInterval}&outputsize=full&entitlement=realtime&apikey=${ALPHA_KEY}`;

            const seriesJson = await fetchAlphaJson(seriesUrl, `EQUITY_SERIES ${sym}`);
            const expectedTsKey = avInterval === "daily" ? "Time Series (Daily)" : `Time Series (${avInterval})`;
            const foundTsKey = Object.keys(seriesJson).find((k) =>
              k === expectedTsKey ||
              k.startsWith("Time Series (")
            );
            const ts = (foundTsKey ? seriesJson[foundTsKey] : undefined) || {};

            const candles: Candle[] = Object.entries(ts)
              .map(([date, v]: any) => ({
                t: String(date),
                open: Number(v["1. open"] ?? NaN),
                high: Number(v["2. high"] ?? NaN),
                low: Number(v["3. low"] ?? NaN),
                close: Number(v["4. close"] ?? NaN),
                volume: Number(v["5. volume"] ?? 0),
              }))
              .filter((c) => Number.isFinite(c.close))
              .sort((a, b) => a.t.localeCompare(b.t));

            if (!candles.length) throw new Error(`No equity candles returned for ${sym}`);

            const closes = candles.map((c) => c.close);
            const highs = candles.map((c) => c.high);
            const lows = candles.map((c) => c.low);
            const volumes = candles.map((c) => (Number.isFinite(c.volume) && c.volume > 0 ? c.volume : 1000));

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
            let price = closes[last];
            const bulkPrice = bulkPriceMap.get(sym.toUpperCase());
            if (Number.isFinite(bulkPrice)) {
              price = bulkPrice as number;
            }

            const rsiVal = rsiArr[last];
            const macHist = macObj.hist[last];
            const macLine = macObj.macdLine[last];
            const sigLine = macObj.signalLine[last];
            const ema200Val = emaArr[last];
            const atrVal = atrArr[last - 1];
            const obvCurrent = obvArr[last];
            const obvPrev = obvArr[last - 1];
            const lastCandleTime = candles[last]?.t;

            const scoreResult = computeScore(
              price,
              ema200Val,
              rsiVal,
              macLine,
              sigLine,
              macHist,
              atrVal,
              adxObj.adx,
              stochObj.k,
              aroonObj.up,
              aroonObj.down,
              cciVal,
              obvCurrent,
              obvPrev
            );

            // Compute trade setup fields (AV path — same logic as cached path)
            const dirLabelAV = scoreResult.direction === 'bearish' ? 'SHORT' : 'LONG';
            const atrSafeAV = Number.isFinite(atrVal) ? atrVal : price * 0.02;
            const entryPriceAV = price;
            const stopPriceAV = dirLabelAV === 'LONG' ? price - atrSafeAV * 1.5 : price + atrSafeAV * 1.5;
            const targetPriceAV = dirLabelAV === 'LONG' ? price + atrSafeAV * 3 : price - atrSafeAV * 3;
            const riskPerUnitAV = Math.abs(entryPriceAV - stopPriceAV);
            const rMultipleCalcAV = riskPerUnitAV > 0 ? Math.abs(targetPriceAV - entryPriceAV) / riskPerUnitAV : 0;
            const confidenceCalcAV = Math.min(99, Math.abs(scoreResult.score));
            const setupLabelAV = `${scoreResult.signals.bullish}B/${scoreResult.signals.bearish}Be signals`;

            const item: ScanResult & { direction?: string; signals?: any } = {
              symbol: sym,
              score: scoreResult.score,
              direction: scoreResult.direction,
              signals: scoreResult.signals,
              confidence: confidenceCalcAV,
              setup: setupLabelAV,
              entry: entryPriceAV,
              stop: Math.max(0, stopPriceAV),
              target: Math.max(0, targetPriceAV),
              rMultiple: Math.round(rMultipleCalcAV * 10) / 10,
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
              obv: obvCurrent,
              lastCandleTime,
            };

            if (scoreResult.score >= (Number.isFinite(minScore) ? minScore : 0)) results.push(item); else if (!results.length) results.push(item);
          } else {
            // cache_only mode but no cached data
            console.warn(`[scanner] ${sym} not in cache (cache_only mode)`);
            errors.push(`${sym}: Data not cached yet. Try again later.`);
          }
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

    const adaptiveBase = await getAdaptiveLayer(
      session.workspaceId,
      {
        skill: 'scanner',
        setupText: `${type} ${timeframe} scan`,
        timeframe,
      },
      50
    );

    // Institutional Filter Engine: downgrade/block low-quality environments before trader sees setup
    const enriched = results.map((result) => {
      const adxValue = Number(result.adx ?? Number.NaN);
      const atrPct = Number.isFinite(result.atr) && Number.isFinite(result.price) && result.price && result.price > 0
        ? (result.atr! / result.price) * 100
        : undefined;

      // === UNIFIED REGIME CLASSIFICATION (single source of truth) ===
      const unifiedRegime = classifyRegime({
        adx: adxValue,
        rsi: Number.isFinite(result.rsi) ? result.rsi : undefined,
        atrPercent: atrPct,
        aroonUp: Number.isFinite(result.aroon_up) ? result.aroon_up : undefined,
        aroonDown: Number.isFinite(result.aroon_down) ? result.aroon_down : undefined,
        direction: result.direction as 'bullish' | 'bearish' | 'neutral' | undefined,
        ema200Above: Number.isFinite(result.price) && Number.isFinite(result.ema200)
          ? result.price! >= result.ema200!
          : undefined,
      });

      const regime = unifiedRegime.institutional;
      const volatilityState = typeof atrPct === 'number'
        ? (atrPct > 7 ? 'extreme' : atrPct > 4 ? 'expanded' : atrPct < 1 ? 'compressed' : 'normal')
        : 'normal';

      // === ACL PIPELINE (wired into scanner response) ===
      const components = estimateComponentsFromContext({
        scannerScore: result.score,
        regime: unifiedRegime.governor,
        adx: adxValue,
        rsi: result.rsi,
        cci: result.cci,
        aroonUp: result.aroon_up,
        aroonDown: result.aroon_down,
        session: 'regular',
        derivativesAvailable: !!(result as any).derivatives,
        fundingRate: (result as any).derivatives?.fundingRate,
        oiChange24h: (result as any).derivatives?.oiChangePercent,
      });
      const regimeScoreResult = computeRegimeScore(components, unifiedRegime.scoring);
      const regimeConfResult = deriveRegimeConfidence({
        adx: adxValue,
        rsi: result.rsi,
        aroonUp: result.aroon_up,
        aroonDown: result.aroon_down,
        inferredRegime: unifiedRegime.scoring,
      });
      const aclResult = computeACLFromScoring(regimeScoreResult, {
        regimeConfidence: regimeConfResult.confidence,
        dataComponentsProvided: [result.rsi, result.adx, result.cci, result.aroon_up, result.stoch_k, result.ema200].filter(v => Number.isFinite(v)).length,
      });

      const institutionalFilter = computeInstitutionalFilter({
        baseScore: result.score,
        strategy: inferStrategyFromText(`${type} ${result.direction || 'neutral'} ${timeframe}`),
        regime,
        liquidity: {
          session: 'regular',
        },
        volatility: {
          atrPercent: atrPct,
          state: volatilityState,
        },
        dataHealth: {
          freshness: 'LIVE',
        },
        riskEnvironment: {
          traderRiskDNA: adaptiveBase.profile?.riskDNA,
          stressLevel: volatilityState === 'extreme' ? 'high' : 'medium',
        },
      });

      const spot = Number(result.price ?? Number.NaN);
      const liquidityContext = buildScannerLiquidityLevels(result.chartData?.candles as any, spot);
      const longShortRatio = result.derivatives?.longShortRatio;
      const liquidationLevels = Number.isFinite(spot) && Number.isFinite(longShortRatio)
        ? [
            {
              level: spot * (longShortRatio! > 1 ? 0.985 : 1.015),
              side: (longShortRatio! > 1 ? 'long_liq' : 'short_liq') as 'long_liq' | 'short_liq',
              weight: 0.85,
            },
            {
              level: spot * (longShortRatio! > 1 ? 1.015 : 0.985),
              side: (longShortRatio! > 1 ? 'short_liq' : 'long_liq') as 'long_liq' | 'short_liq',
              weight: 0.65,
            },
          ]
        : undefined;

      const capitalFlow = Number.isFinite(spot)
        ? computeCapitalFlowEngine({
            symbol: result.symbol,
            marketType: type === 'crypto' ? 'crypto' : 'equity',
            spot,
            vwap: liquidityContext.vwap,
            atr: result.atr,
            liquidityLevels: liquidityContext.levels,
            cryptoPositioning: type === 'crypto'
              ? {
                  openInterestUsd: result.derivatives?.openInterest,
                  oiChangePercent: result.derivatives?.oiChangePercent,
                  fundingRate: result.derivatives?.fundingRate,
                  basisPercent: result.derivatives?.basisPercent,
                  longShortRatio: result.derivatives?.longShortRatio,
                  liquidationLevels,
                }
              : undefined,
            trendMetrics: {
              adx: result.adx,
              emaAligned: Number.isFinite(result.price) && Number.isFinite(result.ema200)
                ? (result.price! >= result.ema200!)
                : undefined,
              structureHigherHighs: liquidityContext.structureHigherHighs,
            },
            dataHealth: {
              freshness: 'LIVE',
              fallbackActive: false,
              lastUpdatedIso: result.lastCandleTime,
            },
          })
        : null;

      return {
        ...result,
        institutionalFilter,
        capitalFlow: capitalFlow ?? undefined,
        // === V2 Scoring: Full ACL pipeline output ===
        scoreV2: {
          regime: {
            governor: unifiedRegime.governor,
            scoring: unifiedRegime.scoring,
            institutional: unifiedRegime.institutional,
            label: unifiedRegime.label,
            confidence: unifiedRegime.confidence,
          },
          regimeScore: {
            weightedScore: regimeScoreResult.weightedScore,
            tradeBias: regimeScoreResult.tradeBias,
            gated: regimeScoreResult.gated,
            gateViolations: regimeScoreResult.gateViolations,
          },
          acl: {
            confidence: aclResult.confidence,
            authorization: aclResult.authorization,
            throttle: aclResult.throttle,
            penalties: aclResult.penalties,
            hardCaps: aclResult.hardCaps,
            reasonCodes: aclResult.reasonCodes,
          },
        },
      };
    });

    const tradeable = enriched.filter((item) => !item.institutionalFilter.noTrade);
    const blockedCount = enriched.length - tradeable.length;

    const finalResults = tradeable.length > 0
      ? tradeable
      : (enriched.length > 0 ? [enriched.sort((a, b) => b.score - a.score)[0]] : []);

    results.length = 0;
    results.push(...finalResults);

    if (type === 'crypto') {
      const beforeFilter = results.length;
      const filtered = results.filter((item) => !isStablecoinSymbol(item.symbol));
      if (filtered.length !== beforeFilter) {
        console.info(`[scanner] removed ${beforeFilter - filtered.length} stablecoin result(s) before response`);
      }
      results.length = 0;
      results.push(...filtered);
    }

    // Record signals for AI learning (async, non-blocking)
    if (results.length > 0) {
      const signalsToRecord: RecordSignalParams[] = results
        .filter(r => r.price && r.direction && r.direction !== 'neutral' && r.score >= 50) // Only record high-conviction bullish/bearish signals
        .map(r => ({
          symbol: r.symbol,
          signalType: type,
          direction: r.direction as 'bullish' | 'bearish',
          score: r.score,
          priceAtSignal: r.price!,
          timeframe,
          features: {
            rsi: r.rsi,
            macd_hist: r.macd_hist,
            ema200: r.ema200,
            atr: r.atr,
            adx: r.adx,
            stoch_k: r.stoch_k,
            stoch_d: r.stoch_d,
            cci: r.cci,
            aroon_up: r.aroon_up,
            aroon_down: r.aroon_down,
            price: r.price,
            score: r.score
          }
        }));
      
      // Fire and forget - don't slow down the response
      recordSignalsBatch(signalsToRecord).catch(err => 
        console.warn('[scanner] Signal recording failed:', err)
      );
    }

    const topResultScore = results[0]?.score ?? 50;
    const adaptive = await getAdaptiveLayer(
      session.workspaceId,
      {
        skill: 'scanner',
        setupText: `${type} ${timeframe} scan`,
        direction: results[0]?.direction,
        timeframe,
      },
      topResultScore
    );

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
        type,
        blockedByInstitutionalFilter: blockedCount,
        adaptiveTrader: {
          profile: adaptive.profile,
          match: adaptive.match,
        },
        riskGovernor: riskSnapshot ? {
          regime: riskSnapshot.regime,
          riskMode: riskSnapshot.risk_mode,
          permission: riskSnapshot.risk_mode === 'LOCKED' ? 'BLOCKED' : 'ACTIVE',
          globalBlocks: riskSnapshot.global_blocks,
          warning: riskSnapshot.risk_mode === 'LOCKED'
            ? 'Risk governor is LOCKED — new entries disabled. These signals are informational only.'
            : riskSnapshot.risk_mode === 'DEFENSIVE'
            ? 'Risk governor is DEFENSIVE — reduced sizing enforced.'
            : null,
        } : null,
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
