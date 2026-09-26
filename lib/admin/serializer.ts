/**
 * Admin Terminal — Serializer
 * Converts real operator engine output (ScanResult, Verdict, etc.)
 * into the admin UI types (AdminSymbolIntelligence, ScannerHit).
 *
 * This is the ONLY file that bridges operator internals → admin UI.
 * @internal
 */

import type { ScanResult, CandidatePipeline } from "@/lib/operator/orchestrator";
import type { Bar, KeyLevel } from "@/types/operator";
import type { OHLCVBar } from "@/lib/indicators";
import { ema, atr, adx, vwap } from "@/lib/indicators";
import type {
  AdminSymbolIntelligence,
  ScannerHit,
  SystemHealth,
} from "./types";
import { toPermissionState, toBiasState } from "./types";
import { renderTruth } from "./truth-layer";
import { computeEliteSignalScore } from "@/lib/operator/elite-score";
import { nyDateTime, usSessionCloseMinutes } from "@/lib/time/usSession";
import { computeBbwpPercentile, relativeVolumeRatio } from "@/lib/operator/feature-engine";

/* ── Compute raw indicator values from bars ── */
function computeRawIndicators(bars: Bar[]) {
  const ohlcv: OHLCVBar[] = bars.map((b) => ({
    timestamp: b.timestamp, open: b.open, high: b.high,
    low: b.low, close: b.close, volume: b.volume,
  }));
  const closes = bars.map((b) => b.close);
  const adxResult = ohlcv.length >= 28 ? adx(ohlcv, 14) : null;
  return {
    ema20: ema(closes, 20) ?? 0,
    ema50: ema(closes, 50) ?? 0,
    // Real EMA200 or null: with fewer than 200 bars there is no EMA200 (it used to read 0).
    ema200: ema(closes, 200),
    vwap: vwap(ohlcv) ?? 0,
    atr: atr(ohlcv, 14) ?? 0,
    adx: adxResult?.adx ?? 0,
    // Scales the admin engines expect (setupClassifier, trapDetection, internalResearchScore): BBWP as a
    // 0..100 percentile and RVOL as a ratio (1.0 = average). The feature vector holds 0..1 scores instead.
    bbwpPercentile: Math.round(computeBbwpPercentile(closes) * 1000) / 10,
    rvol: roundRatio(relativeVolumeRatio(bars)),
  };
}

function roundRatio(v: number | null): number | null {
  return v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100;
}

/* ── Day change ── */

function barMs(b: Bar): number {
  const t = b.timestamp;
  // Daily bars are "YYYY-MM-DD"; intraday bars are ISO UTC instants (see normalizeAvBarTimestamp).
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? Date.parse(`${t}T00:00:00Z`) : Date.parse(t);
}

/**
 * The day's change in percent, from bars alone, or null when the bars do not reach back far enough.
 * - Daily bars: last close vs the previous daily close.
 * - Equity intraday: last close vs the previous US session's regular-hours close (last bar starting before
 *   the session close on the previous NY date).
 * - Crypto intraday: last close vs the close 24 hours earlier.
 * (It used to be last bar vs the bar before it — a one-bar change labelled as the day's change.)
 */
export function dayChangePercentFromBars(bars: Bar[], market?: string): number | null {
  if (bars.length < 2) return null;
  const last = bars[bars.length - 1];
  if (!(last.close > 0)) return null;
  const pct = (ref: number | undefined) => (ref && ref > 0 ? ((last.close - ref) / ref) * 100 : null);
  if (/^\d{4}-\d{2}-\d{2}$/.test(last.timestamp)) return pct(bars[bars.length - 2].close);

  const lastMs = barMs(last);
  if (!Number.isFinite(lastMs)) return null;

  if (String(market || "").toUpperCase() === "CRYPTO") {
    const cutoff = lastMs - 24 * 3600_000;
    for (let i = bars.length - 2; i >= 0; i--) {
      const ms = barMs(bars[i]);
      if (Number.isFinite(ms) && ms <= cutoff) return pct(bars[i].close);
    }
    return null;
  }

  const lastDay = nyDateTime(lastMs).ymd;
  for (let i = bars.length - 2; i >= 0; i--) {
    const ms = barMs(bars[i]);
    if (!Number.isFinite(ms)) continue;
    const { ymd, minutes } = nyDateTime(ms);
    if (ymd >= lastDay) continue;
    if (minutes < usSessionCloseMinutes(ymd)) return pct(bars[i].close);
  }
  return null;
}

/* ── Map KeyLevel[] → flat levels object for admin UI ── */
function extractLevels(keyLevels: KeyLevel[]): AdminSymbolIntelligence["levels"] {
  const find = (cat: string) => keyLevels.find((l) => l.category === cat)?.price ?? 0;
  return {
    pdh: find("PDH"),
    pdl: find("PDL"),
    weeklyHigh: find("WEEKLY_HIGH"),
    weeklyLow: find("WEEKLY_LOW"),
    monthlyHigh: find("MONTHLY_HIGH"),
    monthlyLow: find("MONTHLY_LOW"),
    midpoint: find("MIDPOINT"),
    vwap: find("VWAP"),
  };
}

/* ── Scanner hit (one row) from a pipeline result ── */
export function pipelineToScannerHit(p: CandidatePipeline): ScannerHit {
  const v = p.verdict;
  const g = p.governance;
  const elite = computeEliteSignalScore(p);
  return {
    symbol: v.symbol,
    bias: toBiasState(v.direction),
    regime: v.regime,
    // Governance-final permission (portfolio-aware). Risk-desk only.
    permission: toPermissionState(g.finalPermission),
    // Market-only permission (pre-governance). Use for discovery filtering.
    marketPermission: toPermissionState(v.permission),
    confidence: Math.round(v.confidenceScore * 10) / 10,
    eliteScore: elite.score,
    eliteGrade: elite.grade,
    setupState: elite.setupState,
    triggerDistancePct: elite.triggerDistancePct,
    featureImportance: elite.featureImportance,
    symbolTrust: Math.round((v.evidence.symbolTrust ?? 0.5) * 100),
    sizeMultiplier: Math.round(v.sizeMultiplier * 100) / 100,
    playbook: v.playbook,
    blockReasons: g.blockReasons ?? v.reasonCodes ?? [],
    timestamp: v.timestamp,
  };
}

/* ── Full scanner results → ScannerHit[] ── */
export function scanResultToHits(result: ScanResult): ScannerHit[] {
  return result.pipelines
    .map(pipelineToScannerHit)
    .sort((a, b) => b.confidence - a.confidence);
}

/* ── Full symbol intelligence from a pipeline + bars ── */
export function pipelineToSymbolIntelligence(
  p: CandidatePipeline,
  bars: Bar[],
  dveFlags: string[] = [],
  scanTimestamp?: string,
  opts: {
    market?: string;
    /** Day change from a quote (e.g. REALTIME_BULK_QUOTES change_percent). Preferred over bars when given. */
    dayChangePercent?: number | null;
  } = {},
): AdminSymbolIntelligence {
  const v = p.verdict;
  const g = p.governance;
  const c = p.candidate;
  const lastBar = bars[bars.length - 1];
  const price = lastBar?.close ?? 0;
  const quoted = opts.dayChangePercent;
  const changePercent = (quoted != null && Number.isFinite(quoted) ? quoted : dayChangePercentFromBars(bars, opts.market ?? v.market)) ?? 0;

  // Extract indicator values from feature vector if available
  // These get populated by the feature engine
  const features = p.featureVector?.features ?? (p as any)._featureVector?.features;

  // Compute raw indicator values from candle data
  const raw = bars.length > 0 ? computeRawIndicators(bars) : null;
  const elite = computeEliteSignalScore(p, bars);

  return {
    symbol: v.symbol,
    timeframe: v.timeframe,
    session: lastBar?.session ?? "UNKNOWN",
    price,
    changePercent: Math.round(changePercent * 100) / 100,
    bias: toBiasState(v.direction),
    regime: v.regime,
    // Governance-final permission (portfolio-aware). Risk-desk only.
    permission: toPermissionState(g.finalPermission),
    // Market-only permission (pre-governance). Use for discovery filtering.
    marketPermission: toPermissionState(v.permission),
    confidence: Math.round(v.confidenceScore * 10) / 10,
    eliteScore: elite.score,
    eliteGrade: elite.grade,
    setupState: elite.setupState,
    triggerDistancePct: elite.triggerDistancePct,
    featureImportance: elite.featureImportance,
    symbolTrust: Math.round((v.evidence.symbolTrust ?? 0.5) * 100),
    sizeMultiplier: Math.round(v.sizeMultiplier * 100) / 100,
    lastScanAt: v.timestamp,
    blockReasons: g.blockReasons ?? [],
    penalties: v.penalties?.map((pen) => pen.code) ?? [],
    playbook: v.playbook,
    indicators: {
      ema20: raw?.ema20 ?? 0,
      ema50: raw?.ema50 ?? 0,
      ema200: raw ? raw.ema200 : null,
      vwap: raw?.vwap ?? 0,
      atr: raw?.atr ?? 0,
      // 0..100 percentile and a plain RVOL ratio. The feature vector's 0..1 scores used to be copied here as-is,
      // so every snapshot read as a BBWP squeeze (≤10 → "Volatility Contraction"/"Squeeze Expansion") with
      // "relative volume below baseline" (score 0.33 at average volume vs the 0.7 ratio threshold).
      bbwpPercentile: features?.bbwpPercentile != null ? Math.round(features.bbwpPercentile * 1000) / 10 : raw?.bbwpPercentile ?? 50,
      adx: raw?.adx ?? 0,
      rvol: raw?.rvol ?? (features?.relativeVolumeScore != null ? Math.round(features.relativeVolumeScore * 300) / 100 : 0),
    },
    dve: {
      state: dveFlags.find((f) => f.includes("EXPAND")) ? "EXPANSION" :
             dveFlags.find((f) => f.includes("COMPRESS")) ? "COMPRESSION" :
             dveFlags.find((f) => f.includes("BREAKOUT")) ? "BREAKOUT" : "NEUTRAL",
      direction: v.direction === "LONG" ? "BULLISH" : v.direction === "SHORT" ? "BEARISH" : "NEUTRAL",
      persistence: features?.volExpansionScore ?? 0,
      breakoutReadiness: features?.structureScore ?? 0,
      trap: dveFlags.includes("VOL_TRAP"),
      exhaustion: dveFlags.includes("EXHAUSTION_RISK"),
    },
    timeConfluence: {
      score: features?.timeConfluenceScore ?? 0,
      hotWindow: (features?.timeConfluenceScore ?? 0) > 70,
      alignmentCount: 0,
      nextClusterAt: "",
    },
    levels: extractLevels(p.keyLevels ?? []),
    targets: {
      entry: c.entryZone?.min ?? 0,
      invalidation: c.invalidationPrice ?? 0,
      target1: c.targets?.[0] ?? 0,
      target2: c.targets?.[1] ?? 0,
      target3: c.targets?.[2] ?? 0,
    },
    evidence: v.evidence,
    truth: renderTruth(p, scanTimestamp ?? v.timestamp),
  };
}

/* ── Symbol snapshot from bars when no playbook qualified ("no setup") ── */
/**
 * Real snapshot for a symbol whose bars were fetched but where the engine found no playbook: last close, day
 * change, EMAs/ATR/VWAP/ADX/BBWP/RVOL and key levels from the bars — never a zero-filled placeholder. Neutral
 * bias, WAIT permission, confidence 0, no targets (there is no trade thesis). Bars are not embedded (saved
 * packets stay small); /api/admin/symbol returns the scan's bars alongside the packet.
 */
export function barsToNoSetupIntelligence(input: {
  symbol: string;
  timeframe: string;
  market?: string;
  bars: Bar[];
  keyLevels?: KeyLevel[];
  scanTimestamp: string;
  dayChangePercent?: number | null;
  blockReasons?: string[];
}): AdminSymbolIntelligence {
  const { bars } = input;
  const last = bars[bars.length - 1];
  const raw = computeRawIndicators(bars);
  const quoted = input.dayChangePercent;
  const change = (quoted != null && Number.isFinite(quoted) ? quoted : dayChangePercentFromBars(bars, input.market)) ?? 0;
  const levels = extractLevels(input.keyLevels ?? []);
  return {
    symbol: input.symbol,
    timeframe: input.timeframe,
    session: last?.session ?? "UNKNOWN",
    price: last?.close ?? 0,
    changePercent: Math.round(change * 100) / 100,
    bias: "NEUTRAL",
    regime: "UNCLASSIFIED",
    permission: "WAIT",
    marketPermission: "WAIT",
    confidence: 0,
    symbolTrust: 50,
    sizeMultiplier: 0,
    lastScanAt: input.scanTimestamp,
    blockReasons: input.blockReasons ?? [],
    penalties: [],
    playbook: "NO_SETUP",
    indicators: {
      ema20: raw.ema20,
      ema50: raw.ema50,
      ema200: raw.ema200,
      vwap: raw.vwap,
      atr: raw.atr,
      bbwpPercentile: raw.bbwpPercentile,
      adx: raw.adx,
      rvol: raw.rvol ?? 0,
    },
    dve: { state: "NEUTRAL", direction: "NEUTRAL", persistence: 0, breakoutReadiness: 0, trap: false, exhaustion: false },
    timeConfluence: { score: 0, hotWindow: false, alignmentCount: 0, nextClusterAt: "" },
    levels: { ...levels, vwap: levels.vwap || raw.vwap },
    targets: { entry: 0, invalidation: 0, target1: 0, target2: 0, target3: 0 },
  };
}

/* ── System health from a scan result ── */
export function scanResultToHealth(
  result: ScanResult | null,
  feedOk: boolean,
): SystemHealth {
  return {
    feed: feedOk ? "HEALTHY" : "DEGRADED",
    websocket: "DISCONNECTED", // Will be CONNECTED once WS is added
    scanner: result ? "RUNNING" : "IDLE",
    cache: "OK",
    api: "LOW_LATENCY",
    lastScanAt: result?.timestamp,
    symbolsScanned: result?.symbolsScanned ?? 0,
    errorsCount: result?.errors?.length ?? 0,
  };
}
