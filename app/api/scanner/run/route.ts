import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth";
import { q as dbQuery } from "@/lib/db";
import { scannerLimiter, getClientIP } from "@/lib/rateLimit";
import { avCircuit } from "@/lib/circuitBreaker";
import { avTakeToken } from "@/lib/avRateGovernor";
import { shouldUseCache, canFallbackToAV, getCacheMode } from "@/lib/cacheMode";
import { getCachedScanData, getBulkCachedScanData, CachedScanData } from "@/lib/scannerCache";
import { verifyCronAuth } from "@/lib/adminAuth";
import { recordSignalsBatch, RecordSignalParams } from "@/lib/signalRecorder";
import { getRuntimeRiskSnapshotInput } from "@/lib/risk/runtimeSnapshot";
import { buildPermissionSnapshot } from "@/lib/risk-governor-hard";
import { getAdaptiveLayer } from "@/lib/adaptiveTrader";
import { computeInstitutionalFilter, inferStrategyFromText } from "@/lib/institutionalFilter";
import { computeCapitalFlowEngine } from "@/lib/capitalFlowEngine";
import { getDerivativesForSymbols, getGlobalData, getOHLC, getOHLCWithVolume, resolveSymbolToId } from "@/lib/coingecko";
import { classifyRegime } from "@/lib/regime-classifier";
import { estimateComponentsFromContext, computeRegimeScore, deriveRegimeConfidence } from "@/lib/ai/regimeScoring";
import { computeACLFromScoring } from "@/lib/ai/adaptiveConfidenceLens";
import { computeScanEnhancements, type ScanEnhancements } from "@/lib/scannerEnhancements";
import { computeDVE } from "@/lib/directionalVolatilityEngine";
import { getEdgeContext } from "@/lib/intelligence/edgeContextBuilder";
import { normalizeSide } from "@/lib/intelligence/edgeProfile";
import type { DVEInput, DVEReading, DVESignalType, VolRegime } from "@/lib/directionalVolatilityEngine.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // Disable static optimization
export const revalidate = 0; // Disable ISR caching

// Scanner API - CoinGecko commercial feed for crypto
// Equity & Forex require commercial data licenses - admin-only testing with Alpha Vantage
// v3.0 - Added cache mode support for reduced AV calls
const SCANNER_VERSION = 'v3.0';
const ALPHA_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const STABLECOIN_SYMBOLS = new Set([
  // USD-pegged
  'USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'USDP', 'GUSD', 'FRAX', 'LUSD',
  'FDUSD', 'PYUSD', 'USDD', 'USDE', 'USDS', 'USD1', 'CRVUSD', 'GHO',
  'MIM', 'RAI', 'SUSD', 'DOLA', 'HAY', 'USDX', 'ZUSD', 'HUSD', 'ALUSD',
  'CUSD', 'USDJ', 'UST', 'USDB', 'USDZ', 'USDK', 'TRIBE', 'FEI',
  'FLEXUSD', 'MIMATIC', 'USDN', 'USDFL',
  // EUR-pegged
  'EURC', 'EURS', 'EURT', 'EUROC', 'AGEUR',
  // Bridged variants
  'USDCE', 'USDTE',
  // Gold-pegged (no directional signals)
  'XAUT', 'PAXG',
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
  mfi?: number;
  vwap?: number;
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
  // Phase 6+ enhancements
  enhancements?: ScanEnhancements;
  // DVE (Directional Volatility Engine) flags
  dveFlags?: string[];
  dveBreakoutScore?: number;
  dveBbwp?: number;
  dveDirectionalBias?: string;
  dveSignalType?: DVESignalType | null;
  dveContractionContinuation?: number;
  dveExpansionContinuation?: number;
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

/** Compute DVE flags for a scanner item. Non-fatal — returns undefined on error. */
function computeScannerDVE(
  closes: number[],
  highs: number[],
  lows: number[],
  price: number,
  symbol: string,
  opts?: { adx?: number; atr?: number; stochK?: number; stochD?: number; fundingRate?: number; oiUsd?: number }
): { dveFlags: string[]; dveBreakoutScore: number; dveBbwp: number; dveDirectionalBias: string; dveSignalType: DVESignalType | null; dveContractionContinuation: number; dveExpansionContinuation: number } | undefined {
  try {
    if (closes.length < 30) return undefined;
    const changePct = closes.length >= 2
      ? ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100
      : 0;
    const dveInput: DVEInput = {
      price: { closes, highs, lows, currentPrice: price, changePct },
      indicators: {
        adx: opts?.adx ?? null,
        atr: opts?.atr ?? null,
        stochK: opts?.stochK ?? null,
        stochD: opts?.stochD ?? null,
      },
      liquidity: opts?.fundingRate != null || opts?.oiUsd != null ? {
        fundingRatePercent: opts.fundingRate,
        oiTotalUsd: opts.oiUsd,
      } : undefined,
    };
    const reading = computeDVE(dveInput, symbol);

    const flags: string[] = [];
    if (reading.volatility.regime === 'compression') flags.push('COMPRESSED');
    if (reading.volatility.regime === 'expansion') flags.push('EXPANDING');
    if (reading.volatility.regime === 'climax') flags.push('CLIMAX');
    if (reading.signal.type === 'compression_release_up' || reading.signal.type === 'compression_release_down') flags.push('BREAKOUT');
    if (reading.signal.type === 'expansion_continuation_up' || reading.signal.type === 'expansion_continuation_down') flags.push('CONTINUATION');
    if (reading.volatility.inSqueeze) flags.push('SQUEEZE_FIRE');
    if (reading.trap.detected) flags.push('VOL_TRAP');
    if (reading.exhaustion.level > 70) flags.push('EXHAUSTION_RISK');
    if (reading.direction.bias !== 'neutral') flags.push(reading.direction.bias === 'bullish' ? 'DIR_BULL' : 'DIR_BEAR');
    if (reading.phasePersistence.contraction.active && reading.phasePersistence.contraction.stats.agePercentile > 80) flags.push('EXTENDED_PHASE');
    if (reading.phasePersistence.expansion.active && reading.phasePersistence.expansion.stats.agePercentile > 80) flags.push('EXTENDED_PHASE');
    if (reading.breakout.score >= 60) flags.push('HIGH_BREAKOUT');

    return {
      dveFlags: flags,
      dveBreakoutScore: reading.breakout.score,
      dveBbwp: reading.volatility.bbwp,
      dveDirectionalBias: reading.direction.bias,
      dveSignalType: reading.signal.type !== 'none' ? reading.signal.type : null,
      dveContractionContinuation: reading.phasePersistence.contraction.continuationProbability,
      dveExpansionContinuation: reading.phasePersistence.expansion.continuationProbability,
    };
  } catch (err) {
    console.warn('[scanner] DVE computation failed for', symbol, err);
    return undefined;
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
    // Auth check FIRST - cron jobs and paid users bypass rate limiter
    const isCronBypass = verifyCronAuth(req);

    const session = isCronBypass
      ? { workspaceId: 'system-cron', tier: 'pro_trader' as const, cid: 'system' }
      : (await getSessionFromCookie()) ?? { workspaceId: 'anonymous', tier: 'free' as const, cid: 'anonymous' };

    // Rate limit check - skip for cron jobs and paid tiers
    if (!isCronBypass && session.tier !== 'pro' && session.tier !== 'pro_trader') {
      const ip = getClientIP(req);
      const rl = scannerLimiter.check(ip);
      if (!rl.allowed) {
        return NextResponse.json(
          { error: 'Too many scanner requests. Please wait before scanning again.', retryAfter: rl.retryAfter },
          { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } }
        );
      }
    }

    // ─── Daily scan limit enforcement ───
    // Free: 5/day, Anonymous: 3/day, Pro/Pro Trader: unlimited
    const SCAN_DAILY_LIMITS: Record<string, number | null> = {
      anonymous: 3,
      free: 5,
      pro: null,       // unlimited
      pro_trader: null, // unlimited
    };
    const scanDailyLimit = SCAN_DAILY_LIMITS[session.tier] ?? 5;
    if (scanDailyLimit !== null && !isCronBypass) {
      try {
        const today = new Date().toISOString().split('T')[0];
        const usage = await dbQuery<{ scan_count: number }>(
          `SELECT scan_count FROM scan_usage WHERE workspace_id = $1 AND scan_date = $2`,
          [session.workspaceId, today]
        );
        const currentCount = usage[0]?.scan_count ?? 0;
        if (currentCount >= scanDailyLimit) {
          const upgradeMsg = session.tier === 'anonymous'
            ? 'Sign up for a free account for 5 scans/day, or upgrade to Pro for unlimited.'
            : 'Upgrade to Pro for unlimited scanning.';
          return NextResponse.json(
            { error: `Daily scan limit reached (${scanDailyLimit}/day). ${upgradeMsg}`, limitReached: true, dailyLimit: scanDailyLimit, usageCount: currentCount },
            { status: 429 }
          );
        }
      } catch (limErr) {
        console.warn('[scanner] Scan usage check failed, continuing:', limErr);
      }
    }

    // ─── Risk Governor awareness ───
    // Fetch current risk state so we can tag results with regime context
    // Skip for anonymous users (no real workspace)
    let riskSnapshot: ReturnType<typeof buildPermissionSnapshot> | null = null;
    if (session.workspaceId !== 'anonymous') {
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

    // If client didn't provide symbols, pull from symbol_universe DB table
    // (populated by the background worker) → full bi-directional coverage
    const FALLBACK_EQUITIES = [
      "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN"
    ];
    const FALLBACK_CRYPTO = [
      "BTC-USD", "ETH-USD", "BNB-USD", "SOL-USD", "XRP-USD"
    ];
    const FALLBACK_FOREX = [
      "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "NZDUSD"
    ];

    let symbolsToScan: string[];
    if (inputSymbols.length) {
      symbolsToScan = inputSymbols;
    } else {
      // Query symbol_universe for all enabled symbols of the requested asset type
      try {
        const assetFilter = type === 'crypto' ? 'crypto' : type === 'forex' ? 'forex' : 'equity';
        const rows = await dbQuery<{ symbol: string }>(
          `SELECT symbol FROM symbol_universe WHERE enabled = TRUE AND COALESCE(asset_type, 'equity') = $1 ORDER BY tier ASC, symbol ASC`,
          [assetFilter]
        );
        if (rows.length > 0) {
          symbolsToScan = rows.map(r => r.symbol.toUpperCase());
          console.info(`[scanner] Loaded ${symbolsToScan.length} ${assetFilter} symbols from symbol_universe`);
        } else {
          // DB empty or unavailable — fall back to hardcoded
          symbolsToScan = type === 'crypto' ? FALLBACK_CRYPTO : type === 'forex' ? FALLBACK_FOREX : FALLBACK_EQUITIES;
          console.warn(`[scanner] symbol_universe empty for ${assetFilter}, using ${symbolsToScan.length} fallback symbols`);
        }
      } catch (dbErr) {
        // DB query failed — fall back to hardcoded
        console.warn(`[scanner] symbol_universe query failed, using fallbacks:`, (dbErr as any)?.message);
        symbolsToScan = type === 'crypto' ? FALLBACK_CRYPTO : type === 'forex' ? FALLBACK_FOREX : FALLBACK_EQUITIES;
      }
    }

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
      "15m": "15min",
      "1h": "60min",
      "30m": "30min",
      "1d": "daily",
      "daily": "daily",
      "weekly": "weekly"
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

    async function fetchVWAP(sym: string) {
      // VWAP is only available for intraday intervals
      if (avInterval === 'daily') return NaN;
      const url = `https://www.alphavantage.co/query?function=VWAP&symbol=${encodeURIComponent(sym)}&interval=${avInterval}&entitlement=realtime&apikey=${ALPHA_KEY}`;
      const j = await fetchAlphaJson(url, `VWAP ${sym}`);
      const ta = j["Technical Analysis: VWAP"] || {};
      const first = Object.values(ta)[0] as any;
      console.debug("[scanner] VWAP", { sym, avInterval, hasTA: !!first });
      return first ? Number(first?.VWAP) : NaN;
    }

    async function fetchOBV(sym: string) {
      const url = `https://www.alphavantage.co/query?function=OBV&symbol=${encodeURIComponent(sym)}&interval=${avInterval}&entitlement=realtime&apikey=${ALPHA_KEY}`;
      const j = await fetchAlphaJson(url, `OBV ${sym}`);
      const ta = j["Technical Analysis: OBV"] || {};
      const entries = Object.values(ta) as any[];
      const current = entries[0] ? Number(entries[0]?.OBV) : NaN;
      const prev = entries[1] ? Number(entries[1]?.OBV) : NaN;
      console.debug("[scanner] OBV", { sym, avInterval, current });
      return { obv: current, obvPrev: prev };
    }

    async function fetchMFI(sym: string) {
      const url = `https://www.alphavantage.co/query?function=MFI&symbol=${encodeURIComponent(sym)}&interval=${avInterval}&time_period=14&entitlement=realtime&apikey=${ALPHA_KEY}`;
      const j = await fetchAlphaJson(url, `MFI ${sym}`);
      const ta = j["Technical Analysis: MFI"] || {};
      const first = Object.values(ta)[0] as any;
      console.debug("[scanner] MFI", { sym, avInterval, hasTA: !!first });
      return first ? Number(first?.MFI) : NaN;
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
        : timeframe === 'weekly'
          ? 90
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

      const ohlcv = await getOHLCWithVolume(coinId, days as 1 | 7 | 14 | 30 | 90 | 180 | 365);
      if (!ohlcv || ohlcv.length === 0) {
        // Fallback to plain OHLC (no volume) if combined fetch fails
        const ohlcFallback = await getOHLC(coinId, days as 1 | 7 | 14 | 30 | 90 | 180 | 365);
        if (!ohlcFallback || ohlcFallback.length === 0) {
          throw new Error(`No CoinGecko OHLC data for ${baseSymbol}`);
        }
        const candles: Candle[] = ohlcFallback
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
        console.info(`[scanner] CoinGecko ${baseSymbol}: ${candles.length} candles (no volume fallback)`);
        return candles;
      }

      const candles: Candle[] = ohlcv
        .map((row) => ({
          t: new Date(row.t).toISOString(),
          open: row.o,
          high: row.h,
          low: row.l,
          close: row.c,
          volume: row.v,
        }))
        .filter((c: Candle) => Number.isFinite(c.close))
        .sort((a, b) => a.t.localeCompare(b.t));

      console.info(`[scanner] CoinGecko ${baseSymbol}: ${candles.length} candles`);
      return candles;
    }

    // Alpha Vantage CRYPTO_INTRADAY / DIGITAL_CURRENCY_WEEKLY for non-daily timeframes
    async function fetchCryptoAV(symbol: string, timeframe: string): Promise<Candle[]> {
      const baseSymbol = symbol.replace(/-USD$/, '').toUpperCase();
      const isWeekly = timeframe === 'weekly';
      const interval = avInterval; // already mapped (e.g. '60min')

      let url: string;
      let tsKey: string;
      if (isWeekly) {
        url = `https://www.alphavantage.co/query?function=DIGITAL_CURRENCY_WEEKLY&symbol=${baseSymbol}&market=USD&apikey=${ALPHA_KEY}`;
        tsKey = 'Time Series (Digital Currency Weekly)';
      } else {
        url = `https://www.alphavantage.co/query?function=CRYPTO_INTRADAY&symbol=${baseSymbol}&market=USD&interval=${interval}&outputsize=full&apikey=${ALPHA_KEY}`;
        tsKey = `Time Series Crypto (${interval})`;
      }

      console.info(`[scanner] fetchCryptoAV ${baseSymbol} tf=${timeframe} interval=${interval}`);
      const j = await fetchAlphaJson(url, `CryptoAV ${baseSymbol}`);
      const ts = j[tsKey] || {};
      const entries = Object.entries(ts);
      if (!entries.length) throw new Error(`No AV crypto data for ${baseSymbol} (${timeframe})`);

      const oKey = isWeekly ? '1a. open (USD)' : '1. open';
      const hKey = isWeekly ? '2a. high (USD)' : '2. high';
      const lKey = isWeekly ? '3a. low (USD)' : '3. low';
      const cKey = isWeekly ? '4a. close (USD)' : '4. close';
      const vKey = isWeekly ? '5. volume' : '5. volume';

      const candles: Candle[] = entries
        .map(([dt, bar]: [string, any]) => ({
          t: new Date(dt).toISOString(),
          open: Number(bar[oKey]),
          high: Number(bar[hKey]),
          low: Number(bar[lKey]),
          close: Number(bar[cKey]),
          volume: Number(bar[vKey] || 0),
        }))
        .filter(c => Number.isFinite(c.close))
        .sort((a, b) => a.t.localeCompare(b.t));

      console.info(`[scanner] AV Crypto ${baseSymbol}: ${candles.length} candles (${timeframe})`);
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

    // Money Flow Index (volume-weighted RSI, 0-100)
    function mfi(highs: number[], lows: number[], closes: number[], volumes: number[], period = 14): number[] {
      const result: number[] = new Array(closes.length).fill(NaN);
      const typicalPrices = closes.map((c, i) => (highs[i] + lows[i] + c) / 3);
      const rawMF = typicalPrices.map((tp, i) => tp * volumes[i]);
      for (let i = period; i < closes.length; i++) {
        let posFlow = 0;
        let negFlow = 0;
        for (let j = i - period + 1; j <= i; j++) {
          if (typicalPrices[j] > typicalPrices[j - 1]) posFlow += rawMF[j];
          else if (typicalPrices[j] < typicalPrices[j - 1]) negFlow += rawMF[j];
        }
        const ratio = negFlow > 0 ? posFlow / negFlow : 100;
        result[i] = 100 - 100 / (1 + ratio);
      }
      return result;
    }

    // VWAP (cumulative within the candle set — resets daily in real intraday, here runs across full set)
    function vwap(highs: number[], lows: number[], closes: number[], volumes: number[]): number[] {
      const result: number[] = [];
      let cumTPV = 0;
      let cumVol = 0;
      for (let i = 0; i < closes.length; i++) {
        const tp = (highs[i] + lows[i] + closes[i]) / 3;
        cumTPV += tp * volumes[i];
        cumVol += volumes[i];
        result.push(cumVol > 0 ? cumTPV / cumVol : tp);
      }
      return result;
    }

    // ── Smart setup label based on technical context ──────────────────
    function deriveSetupLabel(opts: {
      direction: 'bullish' | 'bearish' | 'neutral';
      rsi?: number;
      adx?: number;
      stochK?: number;
      stochD?: number;
      macdHist?: number;
      close?: number;
      ema200?: number;
      bbwp?: number;
      dveFlags?: string[];
      mfi?: number;
      aroonUp?: number;
      aroonDown?: number;
      fundingRate?: number;
    }): string {
      const { direction, rsi: rsiV, adx: adxV, stochK: skV, stochD: sdV, macdHist, close, ema200, bbwp, dveFlags, mfi: mfiV, aroonUp, aroonDown, fundingRate } = opts;
      const flags = dveFlags ?? [];
      const isBull = direction === 'bullish';
      const isBear = direction === 'bearish';

      // DVE squeeze fire — highest conviction volatility signal
      if (flags.includes('SQUEEZE_FIRE')) {
        return isBull ? 'Squeeze Breakout Long' : isBear ? 'Squeeze Breakdown Short' : 'Squeeze Fired';
      }

      // DVE compression with high breakout likelihood
      if ((flags.includes('COMPRESSED') || (Number.isFinite(bbwp) && bbwp! < 15)) && flags.includes('HIGH_BREAKOUT')) {
        return 'Compression Breakout Imminent';
      }

      // DVE compression
      if (flags.includes('COMPRESSED') || (Number.isFinite(bbwp) && bbwp! < 15)) {
        return 'Volatility Compression';
      }

      // DVE expansion continuation
      if ((flags.includes('EXPANSION') || flags.includes('EXPANDING')) && flags.includes('CONTINUATION')) {
        return isBull ? 'Expansion Continuation Long' : 'Expansion Continuation Short';
      }

      // DVE expansion
      if (flags.includes('EXPANSION') || flags.includes('EXPANDING')) {
        return isBull ? 'Volatility Expansion Long' : isBear ? 'Volatility Expansion Short' : 'Volatility Expansion';
      }

      // DVE exhaustion
      if (flags.includes('EXHAUSTION_RISK')) {
        return isBull ? 'Exhaustion Reversal Short' : isBear ? 'Exhaustion Reversal Long' : 'Exhaustion Risk';
      }

      // Momentum extremes with volume confirmation (MFI)
      const mfiExtreme = Number.isFinite(mfiV) && (mfiV! < 20 || mfiV! > 80);
      if (Number.isFinite(rsiV)) {
        if (rsiV! < 30 && isBull) return mfiExtreme ? 'Oversold Bounce (Volume Confirmed)' : 'Oversold Bounce';
        if (rsiV! > 70 && isBear) return mfiExtreme ? 'Overbought Rejection (Volume Confirmed)' : 'Overbought Rejection';
        if (rsiV! < 30 && isBear) return 'Oversold Breakdown';
        if (rsiV! > 70 && isBull) return 'Overbought Breakout';
      }

      // Stochastic crossover extremes
      if (Number.isFinite(skV) && Number.isFinite(sdV)) {
        if (skV! < 20 && skV! > sdV! && isBull) return 'Stochastic Oversold Cross Long';
        if (skV! > 80 && skV! < sdV! && isBear) return 'Stochastic Overbought Cross Short';
      }

      // Trend vs EMA200
      const aboveEma = Number.isFinite(close) && Number.isFinite(ema200) && close! > ema200!;
      const belowEma = Number.isFinite(close) && Number.isFinite(ema200) && close! < ema200!;
      const strongTrend = Number.isFinite(adxV) && adxV! >= 25;

      // Strong trend continuation with Aroon confirmation
      const aroonAligned = Number.isFinite(aroonUp) && Number.isFinite(aroonDown) &&
        ((isBull && aroonUp! > 70 && aroonUp! > aroonDown!) || (isBear && aroonDown! > 70 && aroonDown! > aroonUp!));

      if (strongTrend && isBull && aboveEma) return aroonAligned ? 'Strong Trend Continuation Long' : 'Trend Continuation Long';
      if (strongTrend && isBear && belowEma) return aroonAligned ? 'Strong Trend Continuation Short' : 'Trend Continuation Short';

      // Pullback detection (price near EMA200 in trend)
      if (Number.isFinite(close) && Number.isFinite(ema200) && ema200! > 0) {
        const dist = Math.abs(close! - ema200!) / ema200! * 100;
        if (dist < 2 && strongTrend && isBull) return 'Pullback to Structure Long';
        if (dist < 2 && strongTrend && isBear) return 'Pullback to Structure Short';
      }

      // Crypto funding rate extremes
      if (Number.isFinite(fundingRate)) {
        if (fundingRate! > 0.05 && isBear) return 'Crowded Long — Fade Short';
        if (fundingRate! < -0.05 && isBull) return 'Crowded Short — Fade Long';
      }

      // Weak trend / range
      if (Number.isFinite(adxV) && adxV! < 20) {
        if (Number.isFinite(rsiV) && rsiV! > 40 && rsiV! < 60) return 'Range Consolidation';
        return isBull ? 'Mean Reversion Long' : isBear ? 'Mean Reversion Short' : 'Mean Reversion Setup';
      }

      // MACD momentum
      if (Number.isFinite(macdHist)) {
        if (macdHist! > 0 && isBull) return 'Bullish Momentum';
        if (macdHist! < 0 && isBear) return 'Bearish Momentum';
      }

      // Fallback
      if (isBull) return 'Bullish Setup';
      if (isBear) return 'Bearish Setup';
      return 'Neutral / Watching';
    }

    // ── Institutional-Grade Scanner Scoring Engine ────────────────────
    // Uses ALL available indicators + DVE + derivatives for scoring.
    // Score = conviction strength (0-100) regardless of direction.
    // Direction is a separate field: bullish, bearish, or neutral.
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
      obvPrev?: number,
      // ── New parameters for expanded scoring ──
      mfiVal?: number,
      vwapVal?: number,
      stochD?: number,
      plusDI?: number,
      minusDI?: number,
      dveBbwp?: number,
      dveBreakoutScore?: number,
      dveFlags?: string[],
      fundingRate?: number,
      oiChangePercent?: number,
    ): { score: number; direction: 'bullish' | 'bearish' | 'neutral'; signals: { bullish: number; bearish: number; neutral: number } } {
      let bullishSignals = 0;
      let bearishSignals = 0;
      let neutralSignals = 0;
      const flags = dveFlags ?? [];

      // =================================================================
      // LAYER 1: TREND STRUCTURE (45% of max weight)
      // These signals tell us the primary directional bias.
      // ADX multiplier scales their influence based on trend strength.
      // =================================================================
      let trendMultiplier = 1.0;
      if (Number.isFinite(adxVal)) {
        if (adxVal! >= 40) trendMultiplier = 1.4;
        else if (adxVal! >= 25) trendMultiplier = 1.2;
        else if (adxVal! >= 20) trendMultiplier = 1.0;
        else trendMultiplier = 0.6; // Choppy — distrust trend signals
      }

      // 1a. Price vs EMA200 — primary trend filter (weight: 2x)
      if (Number.isFinite(ema200) && Number.isFinite(close)) {
        const emaWeight = 2 * trendMultiplier;
        const pctFromEma = ((close! - ema200) / ema200) * 100;
        if (pctFromEma > 3) { bullishSignals += emaWeight; }       // Solidly above
        else if (pctFromEma > 1) { bullishSignals += emaWeight * 0.7; } // Slightly above
        else if (pctFromEma < -3) { bearishSignals += emaWeight; }  // Solidly below
        else if (pctFromEma < -1) { bearishSignals += emaWeight * 0.7; }
        else { neutralSignals += 1; } // Near EMA = no edge
      }

      // 1b. DI+ vs DI- — directional movement (weight: 1.5x)
      // This tells us WHO is winning: buyers or sellers.
      if (Number.isFinite(plusDI) && Number.isFinite(minusDI)) {
        const diWeight = 1.5 * trendMultiplier;
        const diDiff = plusDI! - minusDI!;
        if (diDiff > 10) { bullishSignals += diWeight; }      // Strong buyer dominance
        else if (diDiff > 3) { bullishSignals += diWeight * 0.6; }
        else if (diDiff < -10) { bearishSignals += diWeight; } // Strong seller dominance
        else if (diDiff < -3) { bearishSignals += diWeight * 0.6; }
        else { neutralSignals += 0.5; }
      }

      // 1c. MACD Histogram — momentum direction (weight: 1x)
      if (Number.isFinite(hist)) {
        const macdHistWeight = 1.0 * trendMultiplier;
        if (hist > 0) { bullishSignals += macdHistWeight; }
        else { bearishSignals += macdHistWeight; }
      }

      // 1d. MACD vs Signal — crossover state (weight: 1x)
      if (Number.isFinite(macd) && Number.isFinite(sig)) {
        const macdSigWeight = 1.0 * trendMultiplier;
        if (macd > sig) { bullishSignals += macdSigWeight; }
        else { bearishSignals += macdSigWeight; }
      }

      // 1e. Aroon Oscillator — trend structure quality (weight: 1x)
      // Uses both up/down for nuanced reading, not just >70 threshold
      if (Number.isFinite(aroonUp) && Number.isFinite(aroonDown)) {
        const aroonWeight = 1.0 * trendMultiplier;
        const aroonOsc = aroonUp! - aroonDown!; // -100 to +100
        if (aroonOsc > 50) { bullishSignals += aroonWeight; }       // Strong uptrend structure
        else if (aroonOsc > 20) { bullishSignals += aroonWeight * 0.6; }
        else if (aroonOsc < -50) { bearishSignals += aroonWeight; }  // Strong downtrend structure
        else if (aroonOsc < -20) { bearishSignals += aroonWeight * 0.6; }
        else { neutralSignals += 0.5; } // No clear structure
      }

      // =================================================================
      // LAYER 2: VOLUME & PARTICIPATION (20% of max weight)
      // Volume confirms conviction. Smart money shows in volume signals.
      // =================================================================

      // 2a. OBV trend — volume participation direction (weight: 1x)
      if (Number.isFinite(obvCurrent) && Number.isFinite(obvPrev) && obvPrev !== 0) {
        const obvWeight = 1.0 * trendMultiplier;
        const obvChange = ((obvCurrent! - obvPrev!) / Math.abs(obvPrev!)) * 100;
        if (obvChange > 2) { bullishSignals += obvWeight; }       // Volume flowing in
        else if (obvChange > 0.5) { bullishSignals += obvWeight * 0.5; }
        else if (obvChange < -2) { bearishSignals += obvWeight; }  // Volume flowing out
        else if (obvChange < -0.5) { bearishSignals += obvWeight * 0.5; }
        else { neutralSignals += 0.5; }
      }

      // 2b. MFI — Money Flow Index (volume-weighted RSI) (weight: 1x)
      // THIS WAS UNUSED BEFORE. MFI confirms if money is flowing into/out.
      if (Number.isFinite(mfiVal)) {
        if (mfiVal! >= 80) { bearishSignals += 1.0; }      // Overbought with volume = distribution
        else if (mfiVal! >= 60) { bullishSignals += 0.8; }  // Healthy inflow
        else if (mfiVal! <= 20) { bullishSignals += 1.0; }  // Oversold with volume = accumulation
        else if (mfiVal! <= 40) { bearishSignals += 0.8; }  // Weak flow
        else { neutralSignals += 0.5; }
      }

      // 2c. Price vs VWAP — institutional execution reference (weight: 0.8x)
      // THIS WAS UNUSED BEFORE. Institutions buy below VWAP, sell above.
      if (Number.isFinite(vwapVal) && Number.isFinite(close) && vwapVal! > 0) {
        const vwapPct = ((close! - vwapVal!) / vwapVal!) * 100;
        if (vwapPct > 1) { bullishSignals += 0.8; }       // Trading above VWAP = bullish
        else if (vwapPct > 0.2) { bullishSignals += 0.4; }
        else if (vwapPct < -1) { bearishSignals += 0.8; }  // Below VWAP = bearish
        else if (vwapPct < -0.2) { bearishSignals += 0.4; }
        else { neutralSignals += 0.3; }
      }

      // =================================================================
      // LAYER 3: OSCILLATORS (25% of max weight)
      // These catch extremes + reversals. NOT affected by ADX.
      // =================================================================

      // 3a. RSI — momentum health (weight: 1x)
      if (Number.isFinite(rsi)) {
        if (rsi > 70) {
          // Overbought: bearish in range, but can persist in trends
          bearishSignals += trendMultiplier >= 1.2 ? 0.5 : 1.0; // Respect trends
        } else if (rsi >= 55) {
          bullishSignals += 1.0; // Healthy bull momentum
        } else if (rsi < 30) {
          // Oversold: bullish bounce likely, but can persist in downtrends
          bullishSignals += trendMultiplier >= 1.2 ? 0.5 : 1.0;
        } else if (rsi <= 45) {
          bearishSignals += 1.0; // Weakening momentum
        } else {
          neutralSignals += 0.7; // Dead zone
        }
      }

      // 3b. Stochastic %K + %D crossover — signal timing (weight: 1x)
      // NOW USES BOTH K AND D instead of just K
      if (Number.isFinite(stochK) && Number.isFinite(stochD)) {
        const kAboveD = stochK! > stochD!;
        if (stochK! > 80 && !kAboveD) { bearishSignals += 1.2; }       // Overbought + bearish cross
        else if (stochK! > 80 && kAboveD) { bearishSignals += 0.5; }    // Overbought but bullish cross
        else if (stochK! < 20 && kAboveD) { bullishSignals += 1.2; }    // Oversold + bullish cross
        else if (stochK! < 20 && !kAboveD) { bullishSignals += 0.5; }   // Oversold but bearish cross
        else if (kAboveD) { bullishSignals += 0.5; }
        else { bearishSignals += 0.5; }
      } else if (Number.isFinite(stochK)) {
        // Fallback: only K available
        if (stochK! > 80) { bearishSignals += 0.8; }
        else if (stochK! < 20) { bullishSignals += 0.8; }
        else if (stochK! >= 50) { bullishSignals += 0.4; }
        else { bearishSignals += 0.4; }
      }

      // 3c. CCI — mean reversion momentum (weight: 0.8x)
      if (Number.isFinite(cciVal)) {
        if (cciVal! > 200) { bearishSignals += 0.8; }       // Extreme overbought = reversal
        else if (cciVal! > 100) { bullishSignals += 0.8; }  // Strong momentum
        else if (cciVal! > 0) { bullishSignals += 0.3; }
        else if (cciVal! < -200) { bullishSignals += 0.8; }  // Extreme oversold = reversal
        else if (cciVal! < -100) { bearishSignals += 0.8; }  // Strong downward
        else { bearishSignals += 0.3; }
      }

      // =================================================================
      // LAYER 4: VOLATILITY REGIME (10% boost/penalty)
      // DVE data modifies conviction — not direction.
      // =================================================================
      let volatilityBoost = 0; // positive = conviction bonus, negative = penalty

      // 4a. BBWP — volatility percentile
      if (Number.isFinite(dveBbwp)) {
        if (dveBbwp! < 10) { volatilityBoost += 5; }        // Extreme compression = breakout imminent, high conviction
        else if (dveBbwp! < 20) { volatilityBoost += 3; }
        else if (dveBbwp! > 90) { volatilityBoost -= 3; }    // Climax volatility = exhaustion risk
        else if (dveBbwp! > 80) { volatilityBoost += 2; }    // High vol but not exhaustion = trend persists
      }

      // 4b. DVE breakout score — probability of breakout
      if (Number.isFinite(dveBreakoutScore)) {
        if (dveBreakoutScore! >= 70) { volatilityBoost += 5; }   // High breakout probability
        else if (dveBreakoutScore! >= 50) { volatilityBoost += 2; }
      }

      // 4c. DVE flags bonus
      if (flags.includes('SQUEEZE_FIRE')) { volatilityBoost += 8; }
      else if (flags.includes('HIGH_BREAKOUT')) { volatilityBoost += 4; }
      if (flags.includes('VOL_TRAP')) { volatilityBoost -= 3; } // Trap = avoid
      if (flags.includes('EXHAUSTION_RISK')) { volatilityBoost -= 5; }

      // 4d. ATR-based risk dampening
      if (Number.isFinite(atr) && Number.isFinite(close) && close! > 0) {
        const atrPercent = (atr / close!) * 100;
        if (atrPercent > 8) { volatilityBoost -= 5; }   // Extreme daily range = lower conviction
        else if (atrPercent > 5) { volatilityBoost -= 2; }
      }

      // =================================================================
      // LAYER 5: DERIVATIVES (crypto only, up to 8% boost)
      // Funding rate, OI changes = smart money positioning.
      // =================================================================
      let derivativesBoost = 0;

      if (Number.isFinite(fundingRate)) {
        // Extreme funding = crowded trade, fade potential
        if (fundingRate! > 0.05) { bearishSignals += 0.8; derivativesBoost += 2; }     // Crowded long
        else if (fundingRate! < -0.05) { bullishSignals += 0.8; derivativesBoost += 2; } // Crowded short
        else if (fundingRate! > 0.01) { bullishSignals += 0.3; } // Mild long bias
        else if (fundingRate! < -0.01) { bearishSignals += 0.3; }
      }

      if (Number.isFinite(oiChangePercent)) {
        // Rising OI + direction = confirms the move, more conviction
        if (Math.abs(oiChangePercent!) > 5) { derivativesBoost += 3; } // Big OI change = active positioning
        else if (Math.abs(oiChangePercent!) > 2) { derivativesBoost += 1; }
      }

      // =================================================================
      // DIRECTION DETERMINATION — 15% threshold for hysteresis
      // =================================================================
      let direction: 'bullish' | 'bearish' | 'neutral';
      if (bullishSignals > bearishSignals * 1.15) {
        direction = 'bullish';
      } else if (bearishSignals > bullishSignals * 1.15) {
        direction = 'bearish';
      } else {
        direction = 'neutral';
      }

      // =================================================================
      // SCORE CALCULATION — Conviction strength (0-100)
      // Measures how strongly indicators agree, regardless of direction.
      // A strong bearish setup scores 90 just like a strong bullish setup.
      // =================================================================
      const dominantSignals = Math.max(bullishSignals, bearishSignals);
      const opposingSignals = Math.min(bullishSignals, bearishSignals);
      const totalDirectional = dominantSignals + opposingSignals;
      // maxSignals is the theoretical max one side could achieve
      // ~13 base weight + up to 40% ADX boost ≈ 18 at max
      const maxSignals = 14 * trendMultiplier;

      // Net conviction: how much one side wins over the other (0 to 1)
      const netConviction = totalDirectional > 0
        ? (dominantSignals - opposingSignals) / totalDirectional
        : 0;

      // Agreement ratio: how much of the theoretical max is achieved (0 to 1)
      const agreementRatio = dominantSignals / maxSignals;

      // Confluence bonus: when many independent signals agree, boost confidence
      // Count signal layers that contributed (rough proxy)
      const layersContributing = [
        Number.isFinite(ema200), Number.isFinite(hist), Number.isFinite(rsi),
        Number.isFinite(stochK), Number.isFinite(cciVal), Number.isFinite(obvCurrent),
        Number.isFinite(mfiVal), Number.isFinite(adxVal), Number.isFinite(aroonUp),
      ].filter(Boolean).length;
      const confluenceBonus = layersContributing >= 7 ? 8 : layersContributing >= 5 ? 4 : 0;

      // Base score: blend of net conviction (50%) and agreement strength (50%)
      let score = Math.round((netConviction * 0.5 + agreementRatio * 0.5) * 85);

      // Add bonuses
      score += confluenceBonus;
      score += Math.max(-10, Math.min(15, volatilityBoost));
      score += Math.max(0, Math.min(8, derivativesBoost));

      // Clamp to 0-100
      score = Math.max(0, Math.min(100, score));

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

    // Cap scan universe; return is further trimmed to top 5 per type.
    // Cache mode = zero AV calls so safe to scan more; AV fallback = cap tight.
    const MAX_PER_SCAN = shouldUseCache() ? 25 : 5;
    const limited = symbolsToScan.slice(0, MAX_PER_SCAN);
    if (symbolsToScan.length > MAX_PER_SCAN) {
      console.info(`[scanner] Capped ${symbolsToScan.length} symbols to ${MAX_PER_SCAN} (cache=${shouldUseCache()})`);
    }
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

    // PRE-FETCH: Benchmark change % for relative strength (non-blocking)
    let benchmarkChangePct = 0;
    const benchmarkName = type === 'crypto' ? 'BTC' : 'SPY';
    try {
      if (type === 'crypto') {
        const btcId = await resolveSymbolToId('BTC');
        if (btcId) {
          const btcOhlc = await getOHLC(btcId, 1);
          if (btcOhlc && btcOhlc.length >= 2) {
            const firstClose = Number(btcOhlc[0][4]);
            const lastClose = Number(btcOhlc[btcOhlc.length - 1][4]);
            if (Number.isFinite(firstClose) && firstClose > 0) {
              benchmarkChangePct = ((lastClose - firstClose) / firstClose) * 100;
            }
          }
        }
      }
      // For equities, benchmarkChangePct stays 0 (SPY data would require an extra AV call)
    } catch (bmErr) {
      console.warn('[scanner] Benchmark fetch for RS failed, using 0:', bmErr);
    }

    for (const sym of limited) {
      try {
        if (type === "crypto") {
          const baseSym = sym;
          
          // Use AV for intraday / weekly crypto; CoinGecko for daily
          const isIntraday = timeframe === '15m' || timeframe === '1h' || timeframe === '30m';
          const isWeekly = timeframe === 'weekly';
          let candles: Candle[];
          try {
            if ((isIntraday || isWeekly) && ALPHA_KEY) {
              candles = await fetchCryptoAV(baseSym, timeframe);
            } else {
              candles = await fetchCryptoCoinGecko(baseSym, timeframe);
            }
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
          const mfiArr = mfi(highs, lows, closes, volumes, 14);
          const vwapArr = vwap(highs, lows, closes, volumes);
          
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
          const mfiVal = mfiArr[last];
          const vwapVal = vwapArr[last];
          
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

          // ── Fetch derivatives BEFORE scoring so we can use funding rate + OI ──
          let cryptoDerivatives: ScanResult['derivatives'] | undefined;
          if (type === 'crypto') {
            try {
              const derivData = await fetchCryptoDerivatives(baseSym);
              if (derivData) {
                cryptoDerivatives = {
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

          // ── Compute DVE BEFORE scoring so BBWP + breakout score feed into score ──
          const dveCrypto = computeScannerDVE(closes, highs, lows, price, baseSym, {
            adx: adxObj.adx, atr: atrVal, stochK: stochObj.k, stochD: stochObj.d,
            fundingRate: cryptoDerivatives?.fundingRate, oiUsd: cryptoDerivatives?.openInterest,
          });

          const scoreResult = computeScore(
            close, ema200Val, rsiVal, macLine, sigLine, macHist, atrVal,
            adxObj.adx, stochObj.k, aroonObj.up, aroonObj.down, cciVal, obvCurrent, obvPrev,
            mfiVal, vwapVal, stochObj.d, adxObj.plus_di, adxObj.minus_di,
            dveCrypto?.dveBbwp, dveCrypto?.dveBreakoutScore, dveCrypto?.dveFlags,
            cryptoDerivatives?.fundingRate, cryptoDerivatives?.oiChangePercent,
          );

          // Compute trade setup fields (same logic as equity cached/AV paths)
          const dirLabelCrypto = scoreResult.direction === 'bearish' ? 'SHORT' : 'LONG';
          const atrSafeCrypto = Number.isFinite(atrVal) ? atrVal : price * 0.02;
          const entryPriceCrypto = price;
          const stopPriceCrypto = dirLabelCrypto === 'LONG' ? price - atrSafeCrypto * 1.5 : price + atrSafeCrypto * 1.5;
          const targetPriceCrypto = dirLabelCrypto === 'LONG' ? price + atrSafeCrypto * 3 : price - atrSafeCrypto * 3;
          const riskPerUnitCrypto = Math.abs(entryPriceCrypto - stopPriceCrypto);
          const rMultipleCalcCrypto = riskPerUnitCrypto > 0 ? Math.abs(targetPriceCrypto - entryPriceCrypto) / riskPerUnitCrypto : 0;
          const confidenceCalcCrypto = Math.min(99, Math.abs(scoreResult.score));
          const setupLabelCrypto = deriveSetupLabel({ direction: scoreResult.direction, rsi: rsiVal, adx: adxObj.adx, stochK: stochObj.k, stochD: stochObj.d, macdHist: macHist, close: price, ema200: ema200Val, bbwp: dveCrypto?.dveBbwp, dveFlags: dveCrypto?.dveFlags, mfi: mfiVal, aroonUp: aroonObj.up, aroonDown: aroonObj.down, fundingRate: cryptoDerivatives?.fundingRate });

          const item: ScanResult & { direction?: string; signals?: any } = {
            symbol: `${baseSym}-USD`,
            score: scoreResult.score,
            direction: scoreResult.direction,
            signals: scoreResult.signals,
            confidence: confidenceCalcCrypto,
            setup: setupLabelCrypto,
            entry: entryPriceCrypto,
            stop: Math.max(0, stopPriceCrypto),
            target: Math.max(0, targetPriceCrypto),
            rMultiple: Math.round(rMultipleCalcCrypto * 10) / 10,
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
            mfi: mfiVal,
            vwap: vwapVal,
            lastCandleTime,
            chartData: {
              candles: chartCandles,
              ema200: chartEma200,
              rsi: chartRsi,
              macd: chartMacd
            }
          };

          // Assign pre-computed derivatives and DVE data
          if (cryptoDerivatives) item.derivatives = cryptoDerivatives;
          if (dveCrypto) Object.assign(item, dveCrypto);
          
          // Compute enhancements: EMA stack, squeeze, relative strength
          try {
            const changePct = closes.length >= 2
              ? ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100
              : 0;
            item.enhancements = computeScanEnhancements({
              closes, highs, lows, price,
              changePct,
              benchmarkChangePct,
              benchmarkName,
            });
          } catch (enhErr) {
            console.warn('[scanner] Enhancement computation failed for', baseSym, enhErr);
          }

          results.push(item);
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
          const mfiArr = mfi(highs, lows, closes, volumes, 14);
          const vwapArr = vwap(highs, lows, closes, volumes);
          
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
          const mfiValForex = mfiArr[last];
          const vwapValForex = vwapArr[last];

          // Compute DVE BEFORE scoring
          const dveForex = computeScannerDVE(closes, highs, lows, price, sym, {
            adx: adxObj.adx, atr: atrVal, stochK: stochObj.k, stochD: stochObj.d,
          });
          
          const scoreResult = computeScore(
            close, ema200Val, rsiVal, macLine, sigLine, macHist, atrVal,
            adxObj.adx, stochObj.k, aroonObj.up, aroonObj.down, cciVal, obvCurrent, obvPrev,
            mfiValForex, vwapValForex, stochObj.d, adxObj.plus_di, adxObj.minus_di,
            dveForex?.dveBbwp, dveForex?.dveBreakoutScore, dveForex?.dveFlags,
          );

          // Compute trade setup fields for forex (same ATR-based logic as equity/crypto)
          const dirLabelFx = scoreResult.direction === 'bearish' ? 'SHORT' : 'LONG';
          const atrSafeFx = Number.isFinite(atrVal) ? atrVal : price * 0.002; // Forex fallback: 0.2% of price (20 pips)
          const entryPriceFx = price;
          const stopPriceFx = dirLabelFx === 'LONG' ? price - atrSafeFx * 1.5 : price + atrSafeFx * 1.5;
          const targetPriceFx = dirLabelFx === 'LONG' ? price + atrSafeFx * 3 : price - atrSafeFx * 3;
          const riskPerUnitFx = Math.abs(entryPriceFx - stopPriceFx);
          const rMultipleCalcFx = riskPerUnitFx > 0 ? Math.abs(targetPriceFx - entryPriceFx) / riskPerUnitFx : 0;
          const confidenceCalcFx = Math.min(99, Math.abs(scoreResult.score));
          const setupLabelFx = deriveSetupLabel({ direction: scoreResult.direction, rsi: rsiVal, adx: adxObj.adx, stochK: stochObj.k, stochD: stochObj.d, macdHist: macHist, close: price, ema200: ema200Val, bbwp: dveForex?.dveBbwp, dveFlags: dveForex?.dveFlags, mfi: mfiValForex, aroonUp: aroonObj.up, aroonDown: aroonObj.down });

          const item: ScanResult & { direction?: string; signals?: any } = {
            symbol: sym,
            score: scoreResult.score,
            direction: scoreResult.direction,
            signals: scoreResult.signals,
            confidence: confidenceCalcFx,
            setup: setupLabelFx,
            entry: entryPriceFx,
            stop: Math.max(0, stopPriceFx),
            target: Math.max(0, targetPriceFx),
            rMultiple: Math.round(rMultipleCalcFx * 10) / 10,
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
            mfi: mfiValForex,
            vwap: vwapValForex,
            lastCandleTime,
          };
          // Compute enhancements for forex
          try {
            const changePct = closes.length >= 2
              ? ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100
              : 0;
            item.enhancements = computeScanEnhancements({
              closes, highs, lows, price,
              changePct,
              benchmarkChangePct: 0, // no benchmark for forex
              benchmarkName: 'USD',
            });
          } catch (enhErr) {
            console.warn('[scanner] Enhancement computation failed for', sym, enhErr);
          }

          // DVE flags for forex (already computed before scoring)
          if (dveForex) Object.assign(item, dveForex);

          results.push(item);
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
            
            const scoreResult = computeScore(price, ema200Val, rsiVal, macLine, sigLine, macHist, atrVal, adxVal, stochK, aroonUp, aroonDown, cciVal, 0, 0,
              undefined, undefined, stochD, undefined, undefined,
              undefined, undefined, undefined,
            );

            // Compute trade setup fields from cached data (same logic as useTickerData fallbacks, but server-side)
            const dirLabel = scoreResult.direction === 'bearish' ? 'SHORT' : 'LONG';
            const atrSafe = Number.isFinite(atrVal) ? atrVal : price * 0.02; // Fallback: 2% of price if ATR missing
            const entryPrice = price;
            const stopPrice = dirLabel === 'LONG' ? price - atrSafe * 1.5 : price + atrSafe * 1.5;
            const targetPrice = dirLabel === 'LONG' ? price + atrSafe * 3 : price - atrSafe * 3;
            const riskPerUnit = Math.abs(entryPrice - stopPrice);
            const rMultipleCalc = riskPerUnit > 0 ? Math.abs(targetPrice - entryPrice) / riskPerUnit : 0;
            const confidenceCalc = Math.min(99, Math.abs(scoreResult.score));
            const setupLabel = deriveSetupLabel({ direction: scoreResult.direction, rsi: rsiVal, adx: adxVal, stochK, stochD, macdHist: macHist, close: price, ema200: ema200Val });

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

            // Fetch chartData from ohlcv_bars (populated by worker alongside the cache)
            try {
              const barRows = await dbQuery<{ ts: string; open: number; high: number; low: number; close: number; volume: number }>(
                `SELECT ts, open, high, low, close, volume FROM ohlcv_bars WHERE symbol = $1 AND timeframe = 'daily' ORDER BY ts DESC LIMIT 50`,
                [sym]
              );
              if (barRows && barRows.length > 0) {
                const sorted = barRows.reverse();
                const bCloses = sorted.map(r => Number(r.close));
                const bHighs = sorted.map(r => Number(r.high));
                const bLows = sorted.map(r => Number(r.low));
                const emaArr = ema(bCloses, 200);
                const rsiArr = rsi(bCloses, 14);
                const macObj = macd(bCloses, 12, 26, 9);
                (item as any).chartData = {
                  candles: sorted.map(r => ({
                    t: typeof r.ts === 'string' ? r.ts.slice(0, 10) : new Date(r.ts).toISOString().slice(0, 10),
                    o: Number(r.open), h: Number(r.high), l: Number(r.low), c: Number(r.close),
                  })),
                  ema200: emaArr,
                  rsi: rsiArr,
                  macd: macObj.macdLine.map((m, i) => ({ macd: m, signal: macObj.signalLine[i], hist: macObj.hist[i] })),
                };

                // DVE flags for equity (cached path — uses bar data)
                const dveCached = computeScannerDVE(bCloses, bHighs, bLows, price, sym, {
                  adx: adxVal, atr: atrVal, stochK, stochD,
                });
                if (dveCached) Object.assign(item, dveCached);
              }
            } catch (chartErr) {
              // Non-fatal — chart will fall back to /api/bars on client
              console.warn(`[scanner] chartData fetch failed for ${sym}:`, (chartErr as any)?.message);
            }

            results.push(item);
            
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
            const mfiArr = mfi(highs, lows, closes, volumes, 14);
            const vwapArr = vwap(highs, lows, closes, volumes);

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
            const mfiValEq = mfiArr.length ? mfiArr[mfiArr.length - 1] : undefined;
            const vwapValEq = vwapArr.length ? vwapArr[vwapArr.length - 1] : undefined;
            const lastCandleTime = candles[last]?.t;

            // Compute DVE BEFORE scoring for equity AV path
            const dveAV = computeScannerDVE(closes, highs, lows, price, sym, {
              adx: adxObj.adx, atr: atrVal, stochK: stochObj.k, stochD: stochObj.d,
            });

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
              obvPrev,
              mfiValEq,
              vwapValEq,
              stochObj.d,
              adxObj.plus_di,
              adxObj.minus_di,
              dveAV?.dveBbwp,
              dveAV?.dveBreakoutScore,
              dveAV?.dveFlags,
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
            const setupLabelAV = deriveSetupLabel({ direction: scoreResult.direction, rsi: rsiVal, adx: adxObj.adx, stochK: stochObj.k, stochD: stochObj.d, macdHist: macHist, close: price, ema200: ema200Val, bbwp: dveAV?.dveBbwp, dveFlags: dveAV?.dveFlags, mfi: mfiValEq, aroonUp: aroonObj.up, aroonDown: aroonObj.down });

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
              mfi: mfiValEq,
              vwap: vwapValEq,
              lastCandleTime,
              // Chart data (last 50 candles) for equity AV path
              chartData: (() => {
                const chartLen = Math.min(50, candles.length);
                const chartOff = candles.length - chartLen;
                return {
                  candles: candles.slice(chartOff).map(c => ({ t: c.t, o: c.open, h: c.high, l: c.low, c: c.close })),
                  ema200: emaArr.slice(chartOff),
                  rsi: rsiArr.slice(chartOff),
                  macd: macObj.macdLine.slice(chartOff).map((m, i) => ({
                    macd: m,
                    signal: macObj.signalLine[chartOff + i],
                    hist: macObj.hist[chartOff + i],
                  })),
                };
              })(),
            };

            // Compute enhancements for equity (AV path)
            try {
              const changePct = closes.length >= 2
                ? ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100
                : 0;
              item.enhancements = computeScanEnhancements({
                closes, highs, lows, price,
                changePct,
                benchmarkChangePct: 0,
                benchmarkName: 'SPY',
              });
            } catch (enhErr) {
              console.warn('[scanner] Enhancement computation failed for', sym, enhErr);
            }

            // DVE flags for equity (AV path — already computed before scoring)
            if (dveAV) Object.assign(item, dveAV);

            results.push(item);
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

    // V3.2: Fetch edge profile hints for soft personalization (non-blocking)
    let softHints: { preferredAssets: string[]; preferredSides: string[]; preferredStrategies: string[]; preferredRegimes: string[]; hasEnoughData: boolean } | null = null;
    try {
      if (session.workspaceId !== 'anonymous') {
        const edgeCtx = await getEdgeContext(session.workspaceId);
        softHints = edgeCtx.hints;
      }
    } catch {
      // Non-critical — skip personalization on failure
    }

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

    // ===== V3.2 SOFT PERSONALIZATION: Apply edge hints as minor score modifier =====
    // Maximum ±10% influence. Only when sufficient historical data exists.
    if (softHints && softHints.hasEnoughData && results.length > 0) {
      let boostCount = 0;
      for (const r of results) {
        let boost = 0;
        const matchedDims: string[] = [];
        const dir = ((r as any).direction || '').toLowerCase();
        const normalizedDir = normalizeSide(dir);

        // Asset class match (+3)
        const assetClass = type === 'crypto' ? 'crypto'
          : type === 'forex' ? 'forex'
          : 'equity';
        if (softHints.preferredAssets.some(a => a.toLowerCase() === assetClass)) {
          boost += 3;
          matchedDims.push('asset');
        }

        // Side match (+3) — uses normalized vocabulary (long/short)
        if (normalizedDir !== 'neutral' && softHints.preferredSides.includes(normalizedDir)) {
          boost += 3;
          matchedDims.push('side');
        }

        // Regime match (+2) — use the enriched regime if available
        const resultRegime = ((r as any).scoreV2?.regime?.label || '').toUpperCase();
        if (resultRegime && softHints.preferredRegimes.some(reg => reg.toUpperCase() === resultRegime)) {
          boost += 2;
          matchedDims.push('regime');
        }

        // Strategy match (+2) — compare setup label against preferred strategies
        const setupLabel = ((r as any).setup || '').toLowerCase();
        if (setupLabel && softHints.preferredStrategies.some(s => setupLabel.includes(s.toLowerCase()))) {
          boost += 2;
          matchedDims.push('strategy');
        }

        // Cap at 10% of base score
        const maxBoost = Math.max(1, Math.round(r.score * 0.1));
        const clamped = Math.min(boost, maxBoost);

        if (clamped > 0) {
          const beforeScore = r.score;
          r.score = Math.min(100, r.score + clamped);
          (r as any).personalEdgeBoost = clamped;
          boostCount++;

          // v3.3 observability: structured log per boosted result
          console.info(`[personalization] boost applied`, JSON.stringify({
            symbol: r.symbol,
            dims: matchedDims,
            before: beforeScore,
            after: r.score,
            boost: clamped,
            maxBoost,
            ws: session.workspaceId?.slice(0, 8),
            ts: new Date().toISOString(),
          }));
        }
      }
      if (boostCount > 0) {
        console.info(`[personalization] summary: ${boostCount}/${results.length} results boosted for workspace ${session.workspaceId?.slice(0, 8)}`);
      }
    }

    // Return only the top 5 results by score
    results.sort((a, b) => b.score - a.score);
    if (results.length > 5) {
      results.length = 5;
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

    // ─── Increment daily scan count ───
    if (scanDailyLimit !== null && !isCronBypass) {
      try {
        const today = new Date().toISOString().split('T')[0];
        await dbQuery(
          `INSERT INTO scan_usage (workspace_id, scan_date, scan_count)
           VALUES ($1, $2, 1)
           ON CONFLICT (workspace_id, scan_date)
           DO UPDATE SET scan_count = scan_usage.scan_count + 1`,
          [session.workspaceId, today]
        );
      } catch (incErr) {
        console.warn('[scanner] Scan usage increment failed:', incErr);
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
