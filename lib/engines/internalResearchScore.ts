/**
 * Internal Research Score Engine
 *
 * Pure scorer that answers: "how strong is the *research* thesis right now?"
 *
 * Hard rules baked into this engine (per Phase 3 brief):
 *   1. dataTrustScore < 50  ⇒  lifecycle = DATA_DEGRADED  (hard floor)
 *   2. No single axis can contribute more than 25% of the composite (cap)
 *   3. Stale or partial data ⇒ score penalty regardless of axis strength
 *
 * Boundary: this score governs *research alerting and ranking only*.
 * It does NOT authorize broker execution, order routing, or sizing.
 */

import type { DataTruth } from "@/lib/engines/dataTruth";
import type { AdminSymbolIntelligence } from "@/lib/admin/types";
import type {
  InternalResearchScore,
  ResearchLifecycle,
  ResearchScoreAxes,
  ResearchScoreBoost,
  ResearchScorePenalty,
} from "@/lib/admin/adminTypes";

/* ───────────── Tuning constants (centralizable later) ───────────── */

/** Per-axis cap as fraction of composite score. */
const ONE_AXIS_CAP_FRACTION = 0.25;

/** Data trust gate that triggers DATA_DEGRADED lifecycle. */
const DATA_TRUST_HARD_FLOOR = 50;

/** Stale/partial penalties (in composite score points). */
const PENALTY_STALE_DATA = 25;
const PENALTY_DEGRADED_DATA = 15;
const PENALTY_DELAYED_DATA = 8;
/**
 * Penalty per blockReason that is data/setup quality related.
 * Governance/execution blockReasons (portfolio drawdown, kill switch, position
 * limits) are excluded — those belong to the Personal Operator Guard lane only
 * and must not suppress market discovery scoring.
 */
const PENALTY_BLOCK_REASON = 12;
const PENALTY_INVALIDATION = 30;
const PENALTY_SIMULATED_DATA = 35;

/**
 * Governance/execution block reason codes that originate from portfolio risk
 * state. These must NOT penalise the research/discovery score.
 */
const EXECUTION_BLOCK_CODES = new Set([
  "KILL_SWITCH_ACTIVE",
  "DAILY_LOSS_LIMIT_HIT",
  "MAX_DRAWDOWN_HIT",
  "OPEN_RISK_LIMIT_HIT",
  "MAX_POSITION_LIMIT_HIT",
  "BROKER_DISCONNECTED",
  "META_HEALTH_THROTTLED",
  "DRAWDOWN_LOCKOUT",
  "PORTFOLIO_CORRELATED",
]);

/** Boosts. */
const BOOST_HIGH_CONFLUENCE = 6;
const BOOST_HIGH_TRUST = 4;

/* ───────────── Public input ───────────── */

export interface ResearchScoreInput {
  snapshot: AdminSymbolIntelligence;
  dataTruth: DataTruth;
  /** Optional previous composite score for change-since-last-scan. */
  previousScore?: number | null;
  /** Optional journal-learning boost from `computeJournalPatternBoost`. */
  journalPatternBoost?: { weight: number; reason: string } | null;
}

/* ───────────── Helpers ───────────── */

const clamp = (v: number, lo = 0, hi = 100): number => {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
};

const pct = (v: number): number => clamp(Math.round(v * 100));

/**
 * Build the per-axis sub-scores (0..100) from a snapshot.
 * Each axis is independent and bounded.
 */
export function deriveAxes(snapshot: AdminSymbolIntelligence): ResearchScoreAxes {
  const i = snapshot.indicators ?? ({} as AdminSymbolIntelligence["indicators"]);
  const ev = snapshot.evidence;
  const tc = snapshot.timeConfluence;
  const dve = snapshot.dve;

  // Prefer evidence axes where present (they're already 0..1 normalized).
  const trend =
    ev?.regimeFit != null
      ? pct(ev.regimeFit)
      : clamp(((i.adx ?? 0) / 50) * 100);
  const momentum =
    ev?.participationFlow != null
      ? pct(ev.participationFlow)
      : clamp(((i.rvol ?? 0) / 3) * 100);
  const volatility =
    ev?.volatilityAlignment != null
      ? pct(ev.volatilityAlignment)
      : clamp(100 - Math.abs(50 - (i.bbwpPercentile ?? 50)) * 2);
  const time = tc?.score != null ? pct(tc.score) : 50;
  // The remaining axes don't have first-class snapshot fields yet — use
  // evidence proxies so the scorer is forward-compatible without faking data.
  const options = ev?.crossMarketConfirmation != null ? pct(ev.crossMarketConfirmation) : 50;
  const liquidity = ev?.structureQuality != null ? pct(ev.structureQuality) : 50;
  const macro = ev?.eventSafety != null ? pct(ev.eventSafety) : 50;
  const sentiment = ev?.symbolTrust != null ? pct(ev.symbolTrust) : pct(snapshot.symbolTrust ?? 0.5);
  const fundamentals = ev?.modelHealth != null ? pct(ev.modelHealth) : 50;

  // DVE-driven downgrades for momentum/trend (trap/exhaustion)
  let trendAdj = trend;
  let momentumAdj = momentum;
  if (dve?.trap) {
    trendAdj = Math.round(trendAdj * 0.5);
    momentumAdj = Math.round(momentumAdj * 0.6);
  }
  if (dve?.exhaustion) {
    momentumAdj = Math.round(momentumAdj * 0.6);
  }

  return {
    trend: trendAdj,
    momentum: momentumAdj,
    volatility,
    time,
    options,
    liquidity,
    macro,
    sentiment,
    fundamentals,
  };
}

/**
 * Apply the one-axis cap. Each axis contributes its sub-score weighted
 * equally (1/9), but no axis can exceed `ONE_AXIS_CAP_FRACTION` of the
 * total composite. Returns { capped, dominant } where capped is the
 * composite (0..100) and dominant is the heaviest contributor.
 */
function applyAxisCap(axes: ResearchScoreAxes): {
  capped: number;
  dominant: keyof ResearchScoreAxes | null;
} {
  const entries = Object.entries(axes) as [keyof ResearchScoreAxes, number][];
  const equalWeight = 1 / entries.length;
  let total = 0;
  let dominant: keyof ResearchScoreAxes | null = null;
  let dominantContribution = -1;

  for (const [name, score] of entries) {
    const rawContribution = score * equalWeight; // 0..(100/9) per axis
    // Cap at ONE_AXIS_CAP_FRACTION * 100 of the composite range.
    const maxContribution = ONE_AXIS_CAP_FRACTION * 100;
    const contribution = Math.min(rawContribution, maxContribution);
    total += contribution;
    if (contribution > dominantContribution) {
      dominantContribution = contribution;
      dominant = name;
    }
  }

  return { capped: clamp(Math.round(total)), dominant };
}

/**
 * Decide lifecycle from the snapshot + final composite + data truth.
 * Hard floor on data trust always wins.
 */
function classifyLifecycle(
  snapshot: AdminSymbolIntelligence,
  dataTruth: DataTruth,
  composite: number,
): ResearchLifecycle {
  // 1. Hard floor — data trust gate
  if (dataTruth.trustScore < DATA_TRUST_HARD_FLOOR) return "DATA_DEGRADED";

  // 2. Explicit DVE/trap/invalidation states
  if (snapshot.dve?.trap) return "TRAPPED";
  if (snapshot.dve?.exhaustion) return "EXHAUSTED";
  if (snapshot.setupState === "INVALIDATED" || snapshot.setupState === "EXPIRED") {
    return "INVALIDATED";
  }
  if (snapshot.setupState === "TRIGGERED") return "TRIGGERED";

  // 3. Composite-driven lifecycle
  if (composite < 35) return "NO_EDGE";
  if (composite < 55) return "DEVELOPING";
  if (composite < 70) return "FRESH";
  return "READY";
}

/* ───────────── Main entry ───────────── */

export function computeInternalResearchScore(input: ResearchScoreInput): InternalResearchScore {
  const { snapshot, dataTruth } = input;

  const axes = deriveAxes(snapshot);
  const { capped: rawComposite, dominant } = applyAxisCap(axes);

  const penalties: ResearchScorePenalty[] = [];
  const boosts: ResearchScoreBoost[] = [];
  const notes: string[] = [];

  // Data-truth penalties
  if (dataTruth.status === "SIMULATED") {
    penalties.push({ code: "DATA_SIMULATED", label: "Data is simulated", weight: PENALTY_SIMULATED_DATA });
  } else if (dataTruth.status === "STALE") {
    penalties.push({ code: "DATA_STALE", label: "Data is stale", weight: PENALTY_STALE_DATA });
  } else if (dataTruth.status === "DEGRADED" || dataTruth.status === "MISSING" || dataTruth.status === "ERROR") {
    penalties.push({ code: "DATA_DEGRADED", label: "Data is degraded or missing", weight: PENALTY_DEGRADED_DATA });
  } else if (dataTruth.status === "DELAYED") {
    penalties.push({ code: "DATA_DELAYED", label: "Data is delayed", weight: PENALTY_DELAYED_DATA });
  }

  // Block-reason penalties — data/setup quality only.
  // Execution/governance block reasons (kill switch, drawdown, position limits)
  // are filtered out here and surfaced instead via the Operator Guard lane.
  const blockReasons = (snapshot.blockReasons ?? [])
    .filter((r) => !EXECUTION_BLOCK_CODES.has(r))
    .slice(0, 3);
  for (const reason of blockReasons) {
    penalties.push({
      code: "BLOCK_REASON",
      label: `Block reason: ${reason}`,
      weight: PENALTY_BLOCK_REASON,
    });
  }

  // Setup-state penalty
  if (snapshot.setupState === "INVALIDATED" || snapshot.setupState === "EXPIRED") {
    penalties.push({
      code: "SETUP_INVALIDATED",
      label: "Setup invalidated or expired",
      weight: PENALTY_INVALIDATION,
    });
  }

  // Boosts
  if (snapshot.timeConfluence?.score >= 0.75 && snapshot.timeConfluence?.hotWindow) {
    boosts.push({ code: "TIME_CONFLUENCE", label: "Time confluence in hot window", weight: BOOST_HIGH_CONFLUENCE });
  }
  if (dataTruth.status === "LIVE" && dataTruth.trustScore >= 90) {
    boosts.push({ code: "HIGH_DATA_TRUST", label: "Live, high-trust data", weight: BOOST_HIGH_TRUST });
  }
  if (input.journalPatternBoost && input.journalPatternBoost.weight > 0) {
    boosts.push({
      code: "JOURNAL_PATTERN_MATCH",
      label: `Journal pattern match — ${input.journalPatternBoost.reason}`,
      weight: input.journalPatternBoost.weight,
    });
  }

  // Apply penalties + boosts
  const totalPenalty = penalties.reduce((sum, p) => sum + p.weight, 0);
  const totalBoost = boosts.reduce((sum, b) => sum + b.weight, 0);
  const composite = clamp(rawComposite - totalPenalty + totalBoost);

  const lifecycle = classifyLifecycle(snapshot, dataTruth, composite);

  // Hard-floor enforcement: DATA_DEGRADED collapses the visible score to
  // make ranking obvious without losing the audit trail.
  let finalScore = composite;
  let scoreDecayReason = "No trust decay applied";
  if (lifecycle === "DATA_DEGRADED") {
    finalScore = Math.min(composite, 35);
    notes.push(`Data trust ${dataTruth.trustScore} below hard floor ${DATA_TRUST_HARD_FLOOR} — score capped.`);
    scoreDecayReason = `Data trust below ${DATA_TRUST_HARD_FLOOR}; capped to degraded ceiling`;
  } else if (dataTruth.status === "SIMULATED") {
    finalScore = Math.min(finalScore, 45);
    scoreDecayReason = "Simulated data; high-priority scoring disabled";
  } else if (dataTruth.status === "STALE") {
    finalScore = Math.min(finalScore, 60);
    scoreDecayReason = "Stale market data reduced effective score";
  } else if (dataTruth.status === "DELAYED") {
    finalScore = Math.min(finalScore, 75);
    scoreDecayReason = "Delayed market data reduced effective score";
  } else if (dataTruth.status === "MISSING" || dataTruth.status === "DEGRADED" || dataTruth.status === "ERROR") {
    finalScore = Math.min(finalScore, 55);
    scoreDecayReason = "Partial or unreliable inputs capped effective score";
  }

  if (dataTruth.status === "MISSING" || dataTruth.status === "DEGRADED") {
    notes.push("Warning: partial data detected; trust-adjusted score should be treated conservatively.");
  }

  notes.push(...dataTruth.notes);

  return {
    score: finalScore,
    rawResearchScore: rawComposite,
    rawScore: rawComposite,
    dataTrustScore: dataTruth.trustScore,
    trustAdjustedScore: finalScore,
    scoreDecayReason,
    lifecycle,
    axes,
    dominantAxis: dominant,
    penalties,
    boosts,
    notes,
  };
}
