/**
 * AdminEdgePacket — canonical projection of AdminResearchPacket for the
 * Admin Command surfaces (queue, home, ARCA desk read, change tape).
 *
 * This is the single contract every admin module reads from and writes
 * back to. It does NOT replace AdminResearchPacket — it is a normalized,
 * UI-friendly projection over it that pins the field names the doctrine
 * mandates (asymmetryScore, timingScore, …, arcaDeskRead, staleAfter).
 *
 * Boundary: research / decision-support only. No execution, no order
 * routing. See .claude/ADMIN_NO_EXECUTION.md.
 */

import type { AdminResearchPacket } from "./getAdminResearchPacket";
import type { ResearchLifecycle } from "./adminTypes";
import type { BiasState } from "./types";
import {
  mapResearchLifecycleToAdminState,
  type AdminLifecycleState,
} from "./lifecycle";
import { evaluateDoNothing, type DoNothingVerdict } from "./doNothing";
import { buildLiquidityMap, type LiquidityMap } from "./liquidityMap";

/* ────────────── Thesis status ────────────── */

export type ThesisStatus =
  | "alive"
  | "weakening"
  | "invalidated"
  | "reversed"
  | "stale"
  | "paid"
  | "crowded"
  | "no_edge";

/* ────────────── ARCA desk read (structured) ────────────── */

export type SetupAge = "early" | "active" | "late" | "dead";

export interface ArcaDeskRead {
  bestIdea: string | null;
  biggestTrap: string | null;
  whatChanged: string | null;
  whatToIgnore: string | null;
  whatNeedsConfirmation: string | null;
  whatInvalidates: string | null;
  setupAge: SetupAge;
  classification: "ADMIN_RESEARCH_COPILOT_NOT_BROKER_EXECUTION";
}

/* ────────────── Canonical edge packet ────────────── */

export interface AdminEdgePacket {
  /* identity */
  packetId: string;
  symbol: string;
  assetClass: "equity" | "crypto" | "futures" | "options";
  market: string;
  timeframe: string;
  generatedAt: string;
  /** Hard TTL — packet must be re-scored or refreshed by this instant. */
  staleAfter: string;

  /* ranking + lifecycle */
  opportunityRank: number;            // 1..N within the queue (0 = unranked)
  opportunityRankScore: number;       // 0..100, internal composite
  adminState: AdminLifecycleState;    // IGNORE..INVALIDATED
  thesisStatus: ThesisStatus;
  setupType: string;                  // SetupDefinition.type
  bias: BiasState;

  /* axis scores (all 0..100, independently scored) */
  asymmetryScore: number;
  timingScore: number;
  volatilityScore: number;
  liquidityScore: number;
  optionsScore: number;
  structureScore: number;
  trapRiskScore: number;              // higher = worse
  invalidationClarityScore: number;

  /* explicit decision levels (research-only, no execution) — per
   * AdminEdgePacket spec. All numbers may be null if the underlying
   * snapshot did not produce a level. */
  entry: {
    trigger: number | null;
    aggressiveEntry: number | null;
    conservativeEntry: number | null;
    explanation: string;
  };
  stopLoss: {
    level: number | null;
    reason: string;
  };
  takeProfit: {
    tp1: number | null;
    tp2: number | null;
    tp3: number | null;
    runner: number | null;
    reason: string;
  };
  riskReward: {
    rrToTp1: number | null;
    rrToTp2: number | null;
    rrToTp3: number | null;
  };

  /* narrative — short, factual, evidence-bound */
  whyNow: string;
  whatChanged: string;
  bearCase: string;
  /** Concrete data points that argue AGAINST the thesis (separate from invalidation triggers). */
  contradictionEvidence: string[];
  doNotTradeReasons: string[];        // empty if none

  /* maps + structure */
  liquidityTargets: LiquidityMap;
  invalidationConditions: string[];
  nextRequiredConfirmation: string | null;

  /* desk officer read (optional — populated by /api/admin/arca DESK_READ) */
  arcaDeskRead: ArcaDeskRead | null;

  /* truth + score-trio (kept separate per ADMIN_RULES.md) */
  evidenceQualityScore: number;       // 0..100 — copy of dataTruth.trustScore
  personalExposureFlag: "none" | "low" | "elevated" | "high";
  doNothing: DoNothingVerdict | null;

  /* provenance */
  sources: string[];
  freshness: "real-time" | "delayed" | "stale" | "unknown";
  simulated: boolean;
  missingFields: string[];
}

/* ────────────── Projection ────────────── */

export interface ProjectEdgePacketOptions {
  /** Default packet TTL in minutes when packet doesn't supply its own. */
  ttlMinutes?: number;
  /** Personal exposure flag (only honored in risk-desk mode upstream). */
  personalExposureFlag?: AdminEdgePacket["personalExposureFlag"];
  /** Optional pre-computed ARCA desk read. */
  arcaDeskRead?: ArcaDeskRead | null;
}

export function projectEdgePacket(
  packet: AdminResearchPacket,
  opts: ProjectEdgePacketOptions = {},
): AdminEdgePacket {
  const ttlMin = opts.ttlMinutes ?? 15;
  const generatedAt = packet.createdAt ?? new Date().toISOString();
  const staleAfter = new Date(
    new Date(generatedAt).getTime() + ttlMin * 60_000,
  ).toISOString();

  const axes = packet.internalResearchScore.axes;
  const asymmetryScore = clamp01to100(deriveAsymmetry(packet));
  const timingScore = Math.round(
    Math.max(
      (packet.timeConfluence?.score ?? 0) * 100,
      axes.time ?? 0,
    ),
  );
  const volatilityScore = clamp01to100(
    packet.volatilityState?.breakoutReadiness ?? axes.volatility ?? 0,
  );
  const structureScore = clamp01to100(
    packet.snapshot?.evidence?.structureQuality ?? 50,
  );
  const liquidityScore = clamp01to100(
    0.6 * structureScore + 0.4 * deriveTargetClarity(packet),
  );
  const optionsScore = clamp01to100(axes.options ?? 50);
  const trapRiskScore = clamp01to100(
    packet.trapDetection?.trapRiskScore ?? (packet.snapshot?.dve?.trap ? 70 : 20),
  );
  const invalidationClarityScore = packet.invalidationConditions?.length
    ? packet.invalidationConditions.length > 1
      ? 100
      : 60
    : 25;

  const evidenceQualityScore = clamp01to100(packet.dataTruth?.trustScore ?? 0);

  const opportunityRankScore = computeRankScore({
    asymmetryScore,
    timingScore,
    volatilityScore,
    liquidityScore,
    optionsScore,
    structureScore,
    trapRiskScore,
    invalidationClarityScore,
    evidenceQualityScore,
  });

  const doNothing = evaluateDoNothing(packet);

  return {
    packetId: packet.packetId,
    symbol: packet.symbol,
    assetClass: packet.assetClass as AdminEdgePacket["assetClass"],
    market: packet.market,
    timeframe: packet.timeframe,
    generatedAt,
    staleAfter,

    opportunityRank: 0,
    opportunityRankScore,
    adminState: mapResearchLifecycleToAdminState(
      packet.internalResearchScore.lifecycle as ResearchLifecycle,
      { score: opportunityRankScore, doNothing: !!doNothing },
    ),
    thesisStatus: deriveThesisStatus(packet, !!doNothing),
    setupType: packet.setup?.type ?? "NO_SETUP",
    bias: (packet.snapshot?.bias ?? "NEUTRAL") as BiasState,

    asymmetryScore,
    timingScore,
    volatilityScore,
    liquidityScore,
    optionsScore,
    structureScore,
    trapRiskScore,
    invalidationClarityScore,

    ...buildDecisionLevels(packet),

    ...buildNarrative(packet),
    doNotTradeReasons: doNothing ? [doNothing.code, ...doNothing.detail] : [],

    liquidityTargets: buildLiquidityMap(packet),
    invalidationConditions: packet.invalidationConditions ?? [],
    nextRequiredConfirmation: packet.nextResearchChecks?.[0] ?? null,

    arcaDeskRead: opts.arcaDeskRead ?? null,

    evidenceQualityScore,
    personalExposureFlag: opts.personalExposureFlag ?? "none",
    doNothing,

    sources: extractSources(packet),
    freshness: mapFreshness(packet.dataTruth?.status),
    simulated: false,
    missingFields: [],
  };
}

/* ────────────── helpers ────────────── */

function clamp01to100(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

/**
 * Project the snapshot's targets/invalidation into the explicit
 * entry/stopLoss/takeProfit/riskReward blocks the AdminEdgePacket spec
 * requires. Bias-aware: for SHORT/BEARISH bias, TP levels are below
 * entry and stop is above; reward/risk math is computed in absolute
 * terms so RR is always positive.
 *
 * Numbers stay null if the underlying snapshot did not provide a level.
 * No fabricated levels — strict per data-integrity rules.
 */
function buildDecisionLevels(packet: AdminResearchPacket): {
  entry: AdminEdgePacket["entry"];
  stopLoss: AdminEdgePacket["stopLoss"];
  takeProfit: AdminEdgePacket["takeProfit"];
  riskReward: AdminEdgePacket["riskReward"];
} {
  const t = packet.snapshot?.targets;
  const px = packet.snapshot?.price ?? null;
  const bias = (packet.snapshot?.bias ?? "NEUTRAL") as string;
  const isShort = bias === "SHORT" || bias === "BEARISH_RESEARCH";

  const valid = (n: unknown): n is number =>
    typeof n === "number" && Number.isFinite(n) && n > 0;

  const entryTrigger = t && valid(t.entry) ? t.entry : null;
  const stopLevel = t && valid(t.invalidation) ? t.invalidation : null;
  const tp1 = t && valid(t.target1) ? t.target1 : null;
  const tp2 = t && valid(t.target2) ? t.target2 : null;
  const tp3 = t && valid(t.target3) ? t.target3 : null;

  // Aggressive = current price if it leads the trigger; conservative =
  // a structure pullback level (PDH/PDL or VWAP). Null if uncertain.
  let aggressive: number | null = null;
  let conservative: number | null = null;
  if (entryTrigger != null && px != null) {
    if (isShort) {
      if (px < entryTrigger) aggressive = px;
      const vwap = packet.liquidityLevels?.vwap;
      if (valid(vwap) && vwap > entryTrigger) conservative = vwap;
    } else {
      if (px > entryTrigger) aggressive = px;
      const vwap = packet.liquidityLevels?.vwap;
      if (valid(vwap) && vwap < entryTrigger) conservative = vwap;
    }
  }

  const rr = (target: number | null): number | null => {
    if (entryTrigger == null || stopLevel == null || target == null) return null;
    const risk = Math.abs(entryTrigger - stopLevel);
    if (risk <= 0) return null;
    const reward = Math.abs(target - entryTrigger);
    return Math.round((reward / risk) * 100) / 100;
  };

  return {
    entry: {
      trigger: entryTrigger,
      aggressiveEntry: aggressive,
      conservativeEntry: conservative,
      explanation: entryTrigger != null
        ? `Trigger from research snapshot (${isShort ? "short" : "long"} bias).`
        : "No structured entry level derived from snapshot.",
    },
    stopLoss: {
      level: stopLevel,
      reason: stopLevel != null
        ? "Snapshot invalidation level (structural)."
        : "No invalidation level derived from snapshot.",
    },
    takeProfit: {
      tp1, tp2, tp3,
      runner: null, // runner concept not derived by snapshot engine yet
      reason: tp1 != null
        ? "Snapshot targets (target1/target2/target3)."
        : "No targets derived from snapshot.",
    },
    riskReward: {
      rrToTp1: rr(tp1),
      rrToTp2: rr(tp2),
      rrToTp3: rr(tp3),
    },
  };
}

function deriveAsymmetry(packet: AdminResearchPacket): number {
  const t = packet.snapshot?.targets;
  if (!t || !t.entry || !t.invalidation || !t.target1) return 0;
  const risk = Math.abs(t.entry - t.invalidation);
  const reward = Math.abs(t.target1 - t.entry);
  if (risk <= 0) return 0;
  const rr = reward / risk;
  return (rr / 2.5) * 100; // 2.5R = full marks
}

function deriveTargetClarity(packet: AdminResearchPacket): number {
  const t = packet.snapshot?.targets;
  if (!t) return 25;
  const filled = [t.entry, t.invalidation, t.target1, t.target2, t.target3]
    .filter((x) => Number.isFinite(x as number)).length;
  return (filled / 5) * 100;
}

function deriveThesisStatus(
  packet: AdminResearchPacket,
  hasDoNothing: boolean,
): ThesisStatus {
  const lc = packet.internalResearchScore.lifecycle;
  if (lc === "INVALIDATED") return "invalidated";
  if (lc === "TRAPPED") return "reversed";
  if (lc === "EXHAUSTED") return "paid";
  if (lc === "NO_EDGE") return "no_edge";
  if (lc === "DATA_DEGRADED") return "stale";
  if (hasDoNothing) return "weakening";
  return "alive";
}

function extractSources(packet: AdminResearchPacket): string[] {
  const out = new Set<string>();
  if (packet.dataTruth?.status) out.add(`dataTruth:${packet.dataTruth.status}`);
  out.add("operator-engine");
  return [...out];
}

function mapFreshness(status: string | undefined): AdminEdgePacket["freshness"] {
  switch (status) {
    case "LIVE": return "real-time";
    case "CACHED": return "delayed";
    case "DELAYED": return "delayed";
    case "STALE": return "stale";
    default: return "unknown";
  }
}

function computeRankScore(s: {
  asymmetryScore: number;
  timingScore: number;
  volatilityScore: number;
  liquidityScore: number;
  optionsScore: number;
  structureScore: number;
  trapRiskScore: number;
  invalidationClarityScore: number;
  evidenceQualityScore: number;
}): number {
  const raw =
    0.22 * s.asymmetryScore +
    0.18 * s.timingScore +
    0.15 * s.volatilityScore +
    0.12 * s.structureScore +
    0.12 * s.liquidityScore +
    0.11 * s.optionsScore +
    0.10 * s.invalidationClarityScore -
    0.20 * s.trapRiskScore;
  // Evidence cap: degraded data can never out-rank live.
  return clamp01to100((raw * s.evidenceQualityScore) / 100);
}

/**
 * Build the narrative quartet (whyNow, whatChanged, bearCase, contradictionEvidence)
 * by stitching together fields already present on the AdminResearchPacket.
 * Never invents — only re-projects existing evidence.
 */
function buildNarrative(packet: AdminResearchPacket): {
  whyNow: string;
  whatChanged: string;
  bearCase: string;
  contradictionEvidence: string[];
} {
  const axes = (packet.internalResearchScore?.axes ?? {}) as unknown as Record<string, number>;
  const dominant = packet.internalResearchScore?.dominantAxis;
  const topAxes = Object.entries(axes)
    .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 3)
    .map(([k, v]) => `${k}=${Math.round(v as number)}`);

  const whyParts: string[] = [];
  if (packet.primaryReason) whyParts.push(packet.primaryReason);
  if (dominant && !whyParts.join(" ").toLowerCase().includes(String(dominant).toLowerCase())) {
    whyParts.push(`Dominant axis: ${dominant}`);
  }
  if (topAxes.length) whyParts.push(`Top axes: ${topAxes.join(", ")}`);
  const whyNow = whyParts.join(" | ") || "No dominant evidence yet.";

  let whatChanged = packet.whatChanged ?? "";
  if (!whatChanged || /previous packet unavailable/i.test(whatChanged)) {
    whatChanged = "No prior packet to diff against - first scan in window.";
  }

  const bearParts: string[] = [];
  if (packet.mainRisk) bearParts.push(packet.mainRisk);
  const trapReason = packet.trapDetection?.reasons?.[0];
  if (trapReason && !bearParts.join(" ").toLowerCase().includes(trapReason.toLowerCase())) {
    bearParts.push(`Trap signal: ${trapReason}`);
  }
  const firstContradiction = packet.contradictionFlags?.[0];
  if (firstContradiction && !bearParts.join(" ").toLowerCase().includes(firstContradiction.toLowerCase())) {
    bearParts.push(`Contradiction: ${firstContradiction}`);
  }
  const bearCase = bearParts.join(" | ") || "No acute risk signal in current snapshot.";

  const contradictionEvidence: string[] = [
    ...(packet.contradictionFlags ?? []),
    ...((packet.trapDetection?.reasons ?? []).slice(1)),
  ];

  return { whyNow, whatChanged, bearCase, contradictionEvidence };
}
