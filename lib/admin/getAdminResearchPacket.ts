import type { Market } from "@/types/operator";
import { runScan } from "@/lib/operator/orchestrator";
import { alphaVantageProvider } from "@/lib/operator/market-data";
import { pipelineToSymbolIntelligence } from "@/lib/admin/serializer";
import { buildAdminScanContext } from "@/lib/admin/scan-context";
import { computeDataTruth } from "@/lib/engines/dataTruth";
import { computeInternalResearchScore } from "@/lib/engines/internalResearchScore";
import { classifySetup } from "@/lib/engines/setupClassifier";
import { detectTrapRisk, type TrapDetectionResult } from "@/lib/engines/trapDetection";
import { buildJournalDNA, computeJournalPatternBoost, type JournalCaseRow } from "@/lib/engines/journalLearning";
import { computeOptionsIntelligence, type OptionsIntelligence } from "@/lib/engines/optionsIntelligence";
import { computeCryptoRegimeIntelligence, type CryptoRegimeIntelligence } from "@/lib/engines/cryptoRegimeIntelligence";
import { computeEarningsRisk, type EarningsRisk } from "@/lib/engines/earningsRisk";
import { snapshotResearchPacket, loadPriorPacketSnapshot } from "@/lib/admin/researchPacketHistory";
import { q } from "@/lib/db";
import type { ArcaAdminContext } from "@/lib/admin/arcaTypes";
import type { AdminSymbolIntelligence } from "@/lib/admin/types";
import type { DataTruth } from "@/lib/engines/dataTruth";
import type { InternalResearchScore, SetupDefinition } from "@/lib/admin/adminTypes";

export type AdminAssetClass = "equity" | "crypto";

export interface AdminResearchPacket {
  packetId: string;
  createdAt: string;
  symbol: string;
  market: string;
  assetClass: AdminAssetClass;
  timeframe: string;
  quote: {
    price: number;
    changePercent: number;
    lastScanAt: string;
  };
  snapshot: AdminSymbolIntelligence;
  dataTruth: DataTruth;
  internalResearchScore: InternalResearchScore;
  rawResearchScore: number;
  dataTrustScore: number;
  trustAdjustedScore: number;
  scoreDecayReason: string;
  setup: SetupDefinition;
  volatilityState: {
    state: string;
    persistence: number;
    breakoutReadiness: number;
    trap: boolean;
    exhaustion: boolean;
  };
  timeConfluence: {
    score: number;
    hotWindow: boolean;
    alignmentCount: number;
    nextClusterAt: string;
  };
  optionsIntelligence: OptionsIntelligence;
  macroContext: {
    regime: "RISK_ON" | "RISK_OFF" | "NEUTRAL";
    note: string;
  };
  newsContext: {
    status: "CALM" | "ELEVATED" | "UNKNOWN";
    note: string;
  };
  earningsContext: EarningsRisk;
  cryptoContext: CryptoRegimeIntelligence | { enabled: false; note: string };
  liquidityLevels: {
    pdh: number;
    pdl: number;
    weeklyHigh: number;
    weeklyLow: number;
    monthlyHigh: number;
    monthlyLow: number;
    vwap: number;
  };
  journalLearningMatch: {
    matched: boolean;
    fit: number;
    reason: string;
  };
  contradictionFlags: string[];
  invalidationConditions: string[];
  nextResearchChecks: string[];
  trapDetection: TrapDetectionResult;
  lifecycle: string;
  bias: string;
  primaryReason: string;
  mainRisk: string;
  whatChanged: string;
  alertEligibility: {
    eligible: boolean;
    reasons: string[];
  };
  arcaContext: ArcaAdminContext;
}

function toAssetClass(market: string): AdminAssetClass {
  return market.toUpperCase() === "CRYPTO" ? "crypto" : "equity";
}

function contradictionFlags(snapshot: AdminSymbolIntelligence, dataTruth: DataTruth, trapRisk: number): string[] {
  const out: string[] = [];
  if (snapshot.bias === "LONG" && snapshot.indicators.ema20 < snapshot.indicators.ema50) {
    out.push("Bullish bias with weak near-term trend alignment");
  }
  if (snapshot.bias === "SHORT" && snapshot.indicators.ema20 > snapshot.indicators.ema50) {
    out.push("Bearish bias with weak near-term trend alignment");
  }
  if (dataTruth.status === "DELAYED" || dataTruth.status === "STALE") {
    out.push("Data freshness does not fully support conviction");
  }
  if (trapRisk >= 60) {
    out.push("Trap risk is elevated");
  }
  return out;
}

function nextResearchChecksFromSnapshot(snapshot: AdminSymbolIntelligence, dataTruth: DataTruth): string[] {
  const checks: string[] = [];
  if ((snapshot.indicators.rvol ?? 0) < 1) checks.push("Recheck participation flow after volume normalization");
  if ((snapshot.timeConfluence?.score ?? 0) < 0.6) checks.push("Wait for stronger time confluence cluster");
  if (snapshot.dve.exhaustion) checks.push("Monitor volatility exhaustion reset before escalation");
  if (dataTruth.status !== "LIVE" && dataTruth.status !== "CACHED") checks.push("Refresh data feeds before high-priority review");
  return checks.slice(0, 4);
}

function invalidationConditions(snapshot: AdminSymbolIntelligence): string[] {
  const out: string[] = [];
  if (snapshot.targets?.invalidation) out.push(`Research invalidation near ${snapshot.targets.invalidation}`);
  if (snapshot.levels?.vwap) out.push(`Loss of VWAP (${snapshot.levels.vwap.toFixed(2)}) weakens current structure`);
  if (snapshot.dve.trap) out.push("DVE trap persistence invalidates momentum thesis");
  return out;
}

async function loadJournalCases(symbol: string, market: string): Promise<JournalCaseRow[]> {
  try {
    const rows = await q<JournalCaseRow>(
      `SELECT symbol, market, timeframe, bias, setup_type AS "setupType", score, lifecycle, data_trust_score AS "dataTrustScore", created_at AS "createdAt"
         FROM admin_research_cases
        WHERE symbol = $1 OR market = $2
        ORDER BY created_at DESC
        LIMIT 120`,
      [symbol, market],
    );
    return rows;
  } catch {
    return [];
  }
}

function deriveMacroContext(snapshot: AdminSymbolIntelligence) {
  const trend = snapshot.indicators.ema20 > snapshot.indicators.ema50 && snapshot.indicators.ema50 > snapshot.indicators.ema200;
  if (trend && snapshot.bias === "LONG") {
    return { regime: "RISK_ON" as const, note: "Trend stack aligned with bullish regime." };
  }
  if (!trend && snapshot.bias === "SHORT") {
    return { regime: "RISK_OFF" as const, note: "Trend stack aligned with defensive regime." };
  }
  return { regime: "NEUTRAL" as const, note: "Mixed trend stack; monitor regime confirmation." };
}

function deriveNewsContext(snapshot: AdminSymbolIntelligence) {
  const elevated = (snapshot.indicators.atr ?? 0) > 0 && (snapshot.indicators.bbwpPercentile ?? 50) > 85;
  return {
    status: elevated ? ("ELEVATED" as const) : ("CALM" as const),
    note: elevated ? "Volatility profile suggests elevated event/news sensitivity." : "No elevated news shock signature detected in volatility profile.",
  };
}

function buildArcaContext(packet: {
  symbol: string;
  market: string;
  timeframe: string;
  bias: string;
  setup: string;
  score: InternalResearchScore;
  dataTruth: DataTruth;
}): ArcaAdminContext {
  return {
    symbol: packet.symbol,
    market: packet.market,
    timeframe: packet.timeframe,
    bias: packet.bias,
    setup: packet.setup,
    score: {
      score: packet.score.trustAdjustedScore,
      lifecycle: packet.score.lifecycle,
      axes: packet.score.axes,
      dominantAxis: packet.score.dominantAxis,
    },
    dataTruth: {
      status: packet.dataTruth.status,
      trustScore: packet.dataTruth.trustScore,
    },
    packet: {
      trustAdjustedScore: packet.score.trustAdjustedScore,
      scoreDecayReason: packet.score.scoreDecayReason,
      contradictionFlags: [],
      nextResearchChecks: [],
      invalidationConditions: [],
      trapRiskScore: 0,
    },
  };
}

function assessAlertEligibility(packet: {
  score: InternalResearchScore;
  dataTruth: DataTruth;
  lifecycle: string;
  contradictionFlags: string[];
  trapRiskScore: number;
  setupType: string;
}): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (packet.score.trustAdjustedScore < 72) reasons.push("Trust-adjusted score below priority threshold");
  if (packet.dataTruth.trustScore < 60) reasons.push("Data trust below alert threshold");
  if (["DATA_DEGRADED", "NO_EDGE", "EXHAUSTED", "TRAPPED", "INVALIDATED"].includes(packet.lifecycle)) {
    reasons.push("Lifecycle not eligible for alerts");
  }
  if (packet.contradictionFlags.length > 2) reasons.push("Too many contradiction flags");
  if (packet.trapRiskScore >= 65) reasons.push("Trap risk excessive");
  if (packet.setupType === "MEAN_REVERSION_TRAP") reasons.push("Trap setup classification");
  if (packet.dataTruth.status === "SIMULATED" || packet.dataTruth.status === "STALE") reasons.push("Stale or simulated data blocks alerts");
  return { eligible: reasons.length === 0, reasons };
}

export async function getAdminResearchPacket(params: {
  symbol: string;
  market?: Market | string;
  timeframe?: string;
}): Promise<AdminResearchPacket> {
  const symbol = params.symbol.toUpperCase();
  const market = (params.market || "CRYPTO").toUpperCase() as Market;
  const timeframe = params.timeframe || "15m";

  const { context } = await buildAdminScanContext();
  const result = await runScan({ symbols: [symbol], market, timeframe }, context, alphaVantageProvider);

  const bars = await alphaVantageProvider.getBars(symbol, market, timeframe).catch(() => []);
  const pipeline = result.pipelines[0];
  const snapshot = pipeline
    ? pipelineToSymbolIntelligence(pipeline, bars, [], result.timestamp)
    : ({
        symbol,
        timeframe,
        session: "UNKNOWN",
        price: 0,
        changePercent: 0,
        bias: "NEUTRAL",
        regime: "ROTATIONAL_RANGE",
        permission: "WAIT",
        confidence: 0,
        symbolTrust: 50,
        sizeMultiplier: 0,
        lastScanAt: result.timestamp,
        blockReasons: result.errors.map((e) => e.error),
        penalties: [],
        indicators: { ema20: 0, ema50: 0, ema200: 0, vwap: 0, atr: 0, bbwpPercentile: 0, adx: 0, rvol: 0 },
        dve: { state: "NEUTRAL", direction: "NEUTRAL", persistence: 0, breakoutReadiness: 0, trap: false, exhaustion: false },
        timeConfluence: { score: 0, hotWindow: false, alignmentCount: 0, nextClusterAt: "" },
        levels: { pdh: 0, pdl: 0, weeklyHigh: 0, weeklyLow: 0, monthlyHigh: 0, monthlyLow: 0, midpoint: 0, vwap: 0 },
        targets: { entry: 0, invalidation: 0, target1: 0, target2: 0, target3: 0 },
      } as AdminSymbolIntelligence);

  const lastBarTime = bars.length > 0 ? new Date(bars[bars.length - 1].timestamp).getTime() : Date.now();
  const ageSec = Math.max(0, Math.round((Date.now() - lastBarTime) / 1000));
  const dataTruth = computeDataTruth({
    marketDataAgeSec: ageSec,
    timeframe,
    isCached: false,
    sourceErrors: result.errors.filter((e) => e.symbol === symbol).map((e) => e.error),
  });

  const setup = classifySetup(snapshot);
  const journalCases = await loadJournalCases(symbol, market);
  const dna = buildJournalDNA(journalCases, {
    symbol,
    market,
    timeframe,
    bias: snapshot.bias,
    setupType: setup.type,
    score: snapshot.confidence,
  });
  const journalBoost = computeJournalPatternBoost(dna.matches);

  const internalResearchScore = computeInternalResearchScore({
    snapshot,
    dataTruth,
    journalPatternBoost: journalBoost,
  });

  const optionsScore = Math.max(0, Math.min(100, Math.round((snapshot.evidence?.crossMarketConfirmation ?? 0.5) * 100)));
  const trap = detectTrapRisk({
    snapshot,
    dataTruth,
    optionsCrowdingScore: optionsScore,
    hasNewsShock: (snapshot.indicators.bbwpPercentile ?? 0) > 90,
    earningsWindowHours: null,
    higherTimeframeConflict: snapshot.bias === "LONG" ? snapshot.indicators.ema50 > snapshot.indicators.ema20 : snapshot.indicators.ema50 < snapshot.indicators.ema20,
  });

  const contradictions = contradictionFlags(snapshot, dataTruth, trap.trapRiskScore);
  const invalidations = invalidationConditions(snapshot);
  const checks = nextResearchChecksFromSnapshot(snapshot, dataTruth);
  const macroContext = deriveMacroContext(snapshot);
  const newsContext = deriveNewsContext(snapshot);
  const assetClass = toAssetClass(market);
  
  // Phase 10: Wire rich intelligence engines
  const optionsIntelligence = await computeOptionsIntelligence({
    symbol,
    assetClass,
    market,
    currentPrice: snapshot.price,
    indicators: snapshot.indicators,
    crossMarketConfidenceProxy: snapshot.evidence?.crossMarketConfirmation,
    dataTruth,
  });

  const earningsContext = await computeEarningsRisk({
    symbol,
    assetClass,
    market,
    dataTruth,
  });

  const cryptoContextData: CryptoRegimeIntelligence | { enabled: false; note: string } =
    assetClass === "crypto"
      ? await computeCryptoRegimeIntelligence({
          currentPrice: snapshot.price,
          marketCapChange: 0, // Not available from snapshot; would need external API
          btcDominance: 45, // Not available from snapshot; would need external API
          dataTruth,
        })
      : { enabled: false as const, note: "Crypto context not applicable for equities." };

  const eligibility = assessAlertEligibility({
    score: internalResearchScore,
    dataTruth,
    lifecycle: internalResearchScore.lifecycle,
    contradictionFlags: contradictions,
    trapRiskScore: trap.trapRiskScore,
    setupType: setup.type,
  });

  const arcaContext = buildArcaContext({
    symbol,
    market,
    timeframe,
    bias: snapshot.bias,
    setup: setup.type,
    score: internalResearchScore,
    dataTruth,
  });
  arcaContext.packet = {
    trustAdjustedScore: internalResearchScore.trustAdjustedScore,
    scoreDecayReason: internalResearchScore.scoreDecayReason,
    contradictionFlags: contradictions,
    nextResearchChecks: checks,
    invalidationConditions: invalidations,
    trapRiskScore: trap.trapRiskScore,
  };

  return {
    packetId: `${symbol}:${market}:${timeframe}:${Date.now()}`,
    createdAt: new Date().toISOString(),
    symbol,
    market,
    assetClass,
    timeframe,
    quote: {
      price: snapshot.price,
      changePercent: snapshot.changePercent,
      lastScanAt: snapshot.lastScanAt,
    },
    snapshot,
    dataTruth,
    internalResearchScore,
    rawResearchScore: internalResearchScore.rawResearchScore,
    dataTrustScore: internalResearchScore.dataTrustScore,
    trustAdjustedScore: internalResearchScore.trustAdjustedScore,
    scoreDecayReason: internalResearchScore.scoreDecayReason,
    setup,
    volatilityState: {
      state: snapshot.dve.state,
      persistence: snapshot.dve.persistence,
      breakoutReadiness: snapshot.dve.breakoutReadiness,
      trap: snapshot.dve.trap,
      exhaustion: snapshot.dve.exhaustion,
    },
    timeConfluence: {
      score: snapshot.timeConfluence.score,
      hotWindow: snapshot.timeConfluence.hotWindow,
      alignmentCount: snapshot.timeConfluence.alignmentCount,
      nextClusterAt: snapshot.timeConfluence.nextClusterAt,
    },
    optionsIntelligence,
    macroContext,
    newsContext,
    earningsContext,
    cryptoContext: cryptoContextData,
    liquidityLevels: {
      pdh: snapshot.levels.pdh,
      pdl: snapshot.levels.pdl,
      weeklyHigh: snapshot.levels.weeklyHigh,
      weeklyLow: snapshot.levels.weeklyLow,
      monthlyHigh: snapshot.levels.monthlyHigh,
      monthlyLow: snapshot.levels.monthlyLow,
      vwap: snapshot.levels.vwap,
    },
    journalLearningMatch: {
      matched: !!journalBoost,
      fit: dna.matches[0]?.fit ?? 0,
      reason: journalBoost?.reason ?? "No strong prior case match",
    },
    contradictionFlags: contradictions,
    invalidationConditions: invalidations,
    nextResearchChecks: checks,
    trapDetection: trap,
    lifecycle: internalResearchScore.lifecycle,
    bias: snapshot.bias,
    primaryReason: internalResearchScore.dominantAxis ? `Dominant evidence axis: ${internalResearchScore.dominantAxis}` : "No dominant evidence axis.",
    mainRisk: trap.reasons[0] ?? "No acute trap signature detected.",
    whatChanged: "Previous packet unavailable for direct delta comparison.",
    alertEligibility: eligibility,
    arcaContext,
  };
}

export async function getAdminResearchPacketsForSymbols(params: {
  symbols: string[];
  market?: Market | string;
  timeframe?: string;
}): Promise<AdminResearchPacket[]> {
  const packets: AdminResearchPacket[] = [];
  for (const symbol of params.symbols) {
    try {
      const packet = await getAdminResearchPacket({
        symbol,
        market: params.market,
        timeframe: params.timeframe,
      });
      packets.push(packet);
    } catch {
      // Continue with remaining symbols; scheduler/event log captures failures.
    }
  }
  return packets;
}
