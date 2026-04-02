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
    ema200: ema(closes, 200) ?? 0,
    vwap: vwap(ohlcv) ?? 0,
    atr: atr(ohlcv, 14) ?? 0,
    adx: adxResult?.adx ?? 0,
  };
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
  return {
    symbol: v.symbol,
    bias: toBiasState(v.direction),
    regime: v.regime,
    permission: toPermissionState(g.finalPermission),
    confidence: Math.round(v.confidenceScore * 10) / 10,
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
): AdminSymbolIntelligence {
  const v = p.verdict;
  const g = p.governance;
  const c = p.candidate;
  const lastBar = bars[bars.length - 1];
  const prevBar = bars.length > 1 ? bars[bars.length - 2] : lastBar;
  const price = lastBar?.close ?? 0;
  const changePercent = prevBar?.close
    ? ((price - prevBar.close) / prevBar.close) * 100
    : 0;

  // Extract indicator values from feature vector if available
  // These get populated by the feature engine
  const features = (p as any)._featureVector?.features;

  // Compute raw indicator values from candle data
  const raw = bars.length > 0 ? computeRawIndicators(bars) : null;

  return {
    symbol: v.symbol,
    timeframe: v.timeframe,
    session: lastBar?.session ?? "UNKNOWN",
    price,
    changePercent: Math.round(changePercent * 100) / 100,
    bias: toBiasState(v.direction),
    regime: v.regime,
    permission: toPermissionState(g.finalPermission),
    confidence: Math.round(v.confidenceScore * 10) / 10,
    symbolTrust: Math.round((v.evidence.symbolTrust ?? 0.5) * 100),
    sizeMultiplier: Math.round(v.sizeMultiplier * 100) / 100,
    lastScanAt: v.timestamp,
    blockReasons: g.blockReasons ?? [],
    penalties: v.penalties?.map((pen) => pen.code) ?? [],
    playbook: v.playbook,
    indicators: {
      ema20: raw?.ema20 ?? 0,
      ema50: raw?.ema50 ?? 0,
      ema200: raw?.ema200 ?? 0,
      vwap: raw?.vwap ?? 0,
      atr: raw?.atr ?? 0,
      bbwpPercentile: features?.bbwpPercentile ?? 0,
      adx: raw?.adx ?? 0,
      rvol: features?.relativeVolumeScore ?? 0,
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
