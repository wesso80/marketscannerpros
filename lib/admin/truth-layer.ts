/**
 * MSP Operator — Truth Layer
 * Version: 1.0
 *
 * The final compression engine that converts raw operator pipeline output
 * into a single authoritative TruthObject per symbol.
 *
 * Pipeline position:
 *   market-data → feature → regime → playbook → doctrine → scoring →
 *   governance → readiness → ★ truth-layer → UI / alerts / replay
 *
 * Rules:
 *   - Never overrides governance
 *   - Never invents decisions
 *   - Always exposes one final answer
 *   - Always exposes one primary reason
 *   - Always shows freshness
 *   - Degrades gracefully on stale/partial data
 */

import type { CandidatePipeline } from "@/lib/operator/orchestrator";
import type { Permission } from "@/types/operator";

/* ═══════════════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════════ */

export type FinalVerdict = "ALLOW" | "ALLOW_REDUCED" | "WAIT" | "BLOCK";

export type OperatorAction =
  | "EXECUTE"
  | "WATCH"
  | "WAIT_FOR_TRIGGER"
  | "IGNORE"
  | "MANUAL_REVIEW"
  | "NO_ACTION";

export type ConfidenceClass = "HIGH" | "MODERATE" | "WEAK" | "INVALID";

export type DataState = "LIVE" | "DELAYED" | "STALE" | "PARTIAL" | "UNAVAILABLE";

export interface TruthReason {
  code: string;
  label: string;          // Human-readable authoritative language
  direction: "POSITIVE" | "NEGATIVE";
  impact: number;         // 0-1
}

export interface TruthTrigger {
  code: string;
  label: string;
}

export interface TruthFreshness {
  marketDataAgeSec: number;
  verdictAgeSec: number;
  governanceAgeSec: number;
  readinessAgeSec: number;
  dataState: DataState;
}

export interface TruthReadiness {
  setupValid: boolean;
  executionReady: boolean;
  triggerHit: boolean;
  thesisState: "STRONG" | "DEGRADED" | "INVALID" | "UNKNOWN";
}

export interface TruthEvidence {
  regimeFit: number;
  structureQuality: number;
  timeConfluence: number;
  volatilityAlignment: number;
  participationFlow: number;
  crossMarketConfirmation: number;
  eventSafety: number;
  extensionSafety: number;
  symbolTrust: number;
  modelHealth: number;
}

export interface TruthObject {
  truthId: string;
  symbol: string;
  market: string;
  timeframe: string;
  timestamp: string;

  // Block 1 — Final Decision
  finalVerdict: FinalVerdict;
  operatorAction: OperatorAction;
  confidenceClass: ConfidenceClass;
  effectiveSize: number;

  // Block 2 — Primary Reason
  primaryReason: TruthReason;

  // Block 3 — Reason Stack
  reasonStack: TruthReason[];

  // Block 4 — Upgrade / Kill
  upgradeTrigger: TruthTrigger;
  killTrigger: TruthTrigger;

  // Block 5 — Why Now / Why Not Stronger
  whyNow: string;
  whyNotStronger: string;

  // Block 6 — Evidence
  evidence: TruthEvidence;

  // Block 7 — Freshness
  freshness: TruthFreshness;

  // Readiness
  readiness: TruthReadiness;

  // Source refs for replay
  sourceRefs: {
    candidateId: string;
    verdictId: string;
    governanceDecisionId: string;
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   REASON CODE → HUMAN LABEL MAPPING
   ═══════════════════════════════════════════════════════════════════════ */

const REASON_LABELS: Record<string, string> = {
  // Negative
  LOW_LIQUIDITY: "Liquidity below minimum deployment threshold",
  LOW_CONFIDENCE: "Score below action threshold",
  NO_TIME_CONFLUENCE: "No active timing edge",
  WEAK_STRUCTURE: "Trend structure too weak for deployment",
  HIGH_TRANSITION_RISK: "Regime transition risk is elevated",
  VOL_COMPRESSION: "Volatility compressed — no expansion signal",
  VOL_TRAP: "Volatility trap detected — false expansion risk",
  EXHAUSTION_RISK: "Extension exhaustion risk present",
  REGIME_MISMATCH: "Regime does not support this playbook",
  DRAWDOWN_LOCKOUT: "Drawdown governor has frozen new risk",
  KILL_SWITCH_ACTIVE: "Kill switch is active",
  CORRELATION_RISK: "Portfolio correlation risk is elevated",
  MAX_POSITIONS: "Maximum position count reached",
  STALE_DATA: "Market data is stale or unavailable",
  LOW_SYMBOL_TRUST: "Low trust: unstable follow-through profile",
  WEAK_CROSS_MARKET: "Cross-market confirmation is absent",
  EVENT_LOCKOUT: "Event window lockout is active",
  LOW_PARTICIPATION: "Participation flow is weak",
  SPREAD_TOO_WIDE: "Spread exceeds deployment threshold",
  // Positive
  REGIME_STRUCTURE_ALIGNMENT: "Strong regime and structure alignment",
  TIME_CONFLUENCE_ACTIVE: "Active timing confluence cluster",
  HIGH_PARTICIPATION: "Strong participation and volume flow",
  BREAKOUT_CONTINUATION: "Breakout continuation structure is aligned",
  TREND_CONTINUATION: "Trend continuation supported by regime",
  PULLBACK_SUPPORT: "Pullback reclaiming support in active trend",
  HIGH_SYMBOL_TRUST: "Symbol shows reliable follow-through",
  STRONG_CROSS_MARKET: "Cross-market conditions confirm bias",
  VOLATILITY_EXPANSION: "Volatility expansion supports move",
};

function labelForCode(code: string): string {
  return REASON_LABELS[code] ?? code.replace(/_/g, " ").toLowerCase();
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIDENCE CLASS
   ═══════════════════════════════════════════════════════════════════════ */

function toConfidenceClass(score: number): ConfidenceClass {
  if (score >= 0.85) return "HIGH";
  if (score >= 0.70) return "MODERATE";
  if (score >= 0.55) return "WEAK";
  return "INVALID";
}

/* ═══════════════════════════════════════════════════════════════════════════
   OPERATOR ACTION RESOLVER
   ═══════════════════════════════════════════════════════════════════════ */

function resolveOperatorAction(
  verdict: FinalVerdict,
  readiness: TruthReadiness,
  dataState: DataState,
): OperatorAction {
  if (dataState === "STALE" || dataState === "UNAVAILABLE" || dataState === "PARTIAL") {
    return "MANUAL_REVIEW";
  }
  switch (verdict) {
    case "ALLOW":
    case "ALLOW_REDUCED":
      return readiness.executionReady ? "EXECUTE" : "WAIT_FOR_TRIGGER";
    case "WAIT":
      return readiness.setupValid ? "WATCH" : "NO_ACTION";
    case "BLOCK":
      return readiness.setupValid ? "IGNORE" : "NO_ACTION";
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   REASON STACK BUILDER
   ═══════════════════════════════════════════════════════════════════════ */

interface ReasonCandidate {
  code: string;
  direction: "POSITIVE" | "NEGATIVE";
  impact: number;
}

function buildReasonStack(pipeline: CandidatePipeline): TruthReason[] {
  const reasons: ReasonCandidate[] = [];
  const v = pipeline.verdict;
  const g = pipeline.governance;
  const ev = v.evidence;

  // Governance hard blocks (highest priority)
  for (const br of g.blockReasons ?? []) {
    const code = br.toUpperCase().replace(/[\s-]+/g, "_");
    reasons.push({ code, direction: "NEGATIVE", impact: 0.95 });
  }

  // Penalties from scoring
  for (const pen of v.penalties ?? []) {
    reasons.push({
      code: pen.code,
      direction: "NEGATIVE",
      impact: Math.min(Math.abs(pen.value) * 2, 0.9),
    });
  }

  // Evidence dimension weaknesses
  const weakThreshold = 0.4;
  const dimensionMap: [string, string, number][] = [
    ["participationFlow", "LOW_PARTICIPATION", ev.participationFlow],
    ["timeConfluence", "NO_TIME_CONFLUENCE", ev.timeConfluence],
    ["structureQuality", "WEAK_STRUCTURE", ev.structureQuality],
    ["volatilityAlignment", "VOL_COMPRESSION", ev.volatilityAlignment],
    ["symbolTrust", "LOW_SYMBOL_TRUST", ev.symbolTrust],
    ["crossMarketConfirmation", "WEAK_CROSS_MARKET", ev.crossMarketConfirmation],
    ["eventSafety", "EVENT_LOCKOUT", ev.eventSafety],
    ["regimeFit", "REGIME_MISMATCH", ev.regimeFit],
  ];

  for (const [, code, score] of dimensionMap) {
    if (score < weakThreshold) {
      reasons.push({ code, direction: "NEGATIVE", impact: (1 - score) * 0.85 });
    }
  }

  // Boosts from scoring (positive reasons)
  for (const boost of v.boosts ?? []) {
    reasons.push({
      code: boost.code,
      direction: "POSITIVE",
      impact: Math.min(boost.value * 2, 0.9),
    });
  }

  // Evidence dimension strengths
  const strongThreshold = 0.7;
  const strengthMap: [string, string, number][] = [
    ["regimeFit", "REGIME_STRUCTURE_ALIGNMENT", ev.regimeFit],
    ["participationFlow", "HIGH_PARTICIPATION", ev.participationFlow],
    ["timeConfluence", "TIME_CONFLUENCE_ACTIVE", ev.timeConfluence],
    ["symbolTrust", "HIGH_SYMBOL_TRUST", ev.symbolTrust],
    ["crossMarketConfirmation", "STRONG_CROSS_MARKET", ev.crossMarketConfirmation],
    ["volatilityAlignment", "VOLATILITY_EXPANSION", ev.volatilityAlignment],
  ];

  for (const [, code, score] of strengthMap) {
    if (score >= strongThreshold) {
      reasons.push({ code, direction: "POSITIVE", impact: score * 0.8 });
    }
  }

  // Deduplicate by code, keep highest impact
  const deduped = new Map<string, ReasonCandidate>();
  for (const r of reasons) {
    const existing = deduped.get(r.code);
    if (!existing || r.impact > existing.impact) {
      deduped.set(r.code, r);
    }
  }

  // Sort by impact descending, take top 5
  return Array.from(deduped.values())
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 5)
    .map((r) => ({
      code: r.code,
      label: labelForCode(r.code),
      direction: r.direction,
      impact: Math.round(r.impact * 100) / 100,
    }));
}

/* ═══════════════════════════════════════════════════════════════════════════
   WHY NOW / WHY NOT STRONGER GENERATOR
   ═══════════════════════════════════════════════════════════════════════ */

function generateWhyNow(pipeline: CandidatePipeline): string {
  const v = pipeline.verdict;
  const playbook = (v.playbook ?? "setup").replace(/_/g, " ").toLowerCase();
  const regime = (v.regime ?? "unknown").replace(/_/g, " ").toLowerCase();

  if (v.confidenceScore < 0.3) {
    return `Weak ${playbook} structure detected, but conditions are below minimum quality.`;
  }
  return `${capitalize(playbook)} detected because ${regime} conditions are present near key structure.`;
}

function generateWhyNotStronger(
  pipeline: CandidatePipeline,
  reasonStack: TruthReason[],
): string {
  const negatives = reasonStack.filter((r) => r.direction === "NEGATIVE");
  if (negatives.length === 0) {
    return "Conditions are strong — minor transition risk remains.";
  }
  if (negatives.length === 1) {
    return negatives[0].label + ".";
  }
  return negatives
    .slice(0, 2)
    .map((r) => r.label.charAt(0).toLowerCase() + r.label.slice(1))
    .join(", and ")
    + ".";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ═══════════════════════════════════════════════════════════════════════════
   UPGRADE / KILL TRIGGER RESOLVER
   ═══════════════════════════════════════════════════════════════════════ */

function resolveUpgradeTrigger(
  pipeline: CandidatePipeline,
  reasonStack: TruthReason[],
): TruthTrigger {
  const negatives = reasonStack.filter((r) => r.direction === "NEGATIVE");
  const topNeg = negatives[0];

  if (!topNeg) {
    return { code: "NONE", label: "Conditions already meet deployment threshold" };
  }

  const upgradeMap: Record<string, TruthTrigger> = {
    LOW_PARTICIPATION: { code: "RELATIVE_VOLUME_EXPANSION", label: "Relative volume expansion above threshold" },
    NO_TIME_CONFLUENCE: { code: "TIME_CLUSTER_ACTIVATION", label: "Time confluence cluster activates" },
    VOL_COMPRESSION: { code: "VOL_EXPANSION", label: "Volatility expansion above breakout threshold" },
    WEAK_STRUCTURE: { code: "STRUCTURE_RECLAIM", label: "Price reclaims structure above key level" },
    LOW_SYMBOL_TRUST: { code: "TRUST_IMPROVEMENT", label: "Follow-through rate improves over next sessions" },
    WEAK_CROSS_MARKET: { code: "CROSS_MARKET_CONFIRM", label: "Cross-market conditions align with bias" },
    DRAWDOWN_LOCKOUT: { code: "DRAWDOWN_COOLDOWN", label: "Governance unlock after drawdown cooldown reset" },
    KILL_SWITCH_ACTIVE: { code: "KILL_SWITCH_OFF", label: "Kill switch deactivated by operator" },
    LOW_LIQUIDITY: { code: "LIQUIDITY_IMPROVEMENT", label: "Participation and liquidity reach deployment threshold" },
    LOW_CONFIDENCE: { code: "SCORE_IMPROVEMENT", label: "Score improves above action threshold" },
    HIGH_TRANSITION_RISK: { code: "TRANSITION_RISK_LOWER", label: "Regime transition risk falls below limit" },
    REGIME_MISMATCH: { code: "REGIME_ALIGNMENT", label: "Regime transitions to support current playbook" },
  };

  return upgradeMap[topNeg.code] ?? {
    code: "CONDITION_IMPROVEMENT",
    label: `${topNeg.label.replace(/\.$/, "")} resolves`,
  };
}

function resolveKillTrigger(pipeline: CandidatePipeline): TruthTrigger {
  const c = pipeline.candidate;
  const invalidation = c.invalidationPrice;

  if (invalidation && invalidation > 0) {
    return {
      code: "INVALIDATION_BREAK",
      label: `Breakdown below invalidation ${invalidation.toFixed(4)}`,
    };
  }

  return {
    code: "LOSS_OF_STRUCTURE",
    label: "Loss of key structure support or regime transition to risk-off",
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   FRESHNESS RESOLVER
   ═══════════════════════════════════════════════════════════════════════ */

function resolveFreshness(
  pipeline: CandidatePipeline,
  scanTimestamp: string,
): TruthFreshness {
  const now = Date.now();
  const scanTime = new Date(scanTimestamp).getTime();
  const verdictTime = new Date(pipeline.verdict.timestamp).getTime();
  const govTime = new Date(pipeline.governance.timestamp).getTime();
  const ageSec = (ref: number) => Math.max(0, Math.round((now - ref) / 1000));

  const marketAge = ageSec(scanTime);
  let dataState: DataState = "LIVE";
  if (marketAge > 300) dataState = "STALE";
  else if (marketAge > 60) dataState = "DELAYED";

  return {
    marketDataAgeSec: marketAge,
    verdictAgeSec: ageSec(verdictTime),
    governanceAgeSec: ageSec(govTime),
    readinessAgeSec: ageSec(verdictTime),
    dataState,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   READINESS RESOLVER
   ═══════════════════════════════════════════════════════════════════════ */

function resolveReadiness(pipeline: CandidatePipeline): TruthReadiness {
  const v = pipeline.verdict;
  const g = pipeline.governance;
  const c = pipeline.candidate;

  const setupValid = c.candidateState === "CANDIDATE" || c.candidateState === "VALIDATED" || c.candidateState === "READY";
  const executionReady =
    (g.finalPermission === "ALLOW" || g.finalPermission === "ALLOW_REDUCED") &&
    v.confidenceScore >= 0.55;
  const triggerHit = c.entryZone != null;

  let thesisState: TruthReadiness["thesisState"] = "UNKNOWN";
  if (v.confidenceScore >= 0.7 && v.evidence.structureQuality >= 0.6) {
    thesisState = "STRONG";
  } else if (v.confidenceScore >= 0.5) {
    thesisState = "DEGRADED";
  } else {
    thesisState = "INVALID";
  }

  return { setupValid, executionReady, triggerHit, thesisState };
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN ENTRY: renderTruth()
   ═══════════════════════════════════════════════════════════════════════ */

export function renderTruth(
  pipeline: CandidatePipeline,
  scanTimestamp: string,
): TruthObject {
  const v = pipeline.verdict;
  const g = pipeline.governance;

  const finalVerdict = g.finalPermission as FinalVerdict;
  const freshness = resolveFreshness(pipeline, scanTimestamp);
  const readiness = resolveReadiness(pipeline);
  const confidenceClass = toConfidenceClass(v.confidenceScore);
  const operatorAction = resolveOperatorAction(finalVerdict, readiness, freshness.dataState);

  const reasonStack = buildReasonStack(pipeline);
  const primaryReason = reasonStack[0] ?? {
    code: "NO_DATA",
    label: "Insufficient data for verdict",
    direction: "NEGATIVE" as const,
    impact: 0,
  };

  const upgradeTrigger = resolveUpgradeTrigger(pipeline, reasonStack);
  const killTrigger = resolveKillTrigger(pipeline);
  const whyNow = generateWhyNow(pipeline);
  const whyNotStronger = generateWhyNotStronger(pipeline, reasonStack);

  const effectiveSize =
    finalVerdict === "BLOCK" ? 0 : Math.round(v.sizeMultiplier * 100) / 100;

  return {
    truthId: `truth_${v.verdictId ?? Date.now()}`,
    symbol: v.symbol,
    market: v.market,
    timeframe: v.timeframe,
    timestamp: new Date().toISOString(),

    finalVerdict,
    operatorAction,
    confidenceClass,
    effectiveSize,

    primaryReason,
    reasonStack,

    upgradeTrigger,
    killTrigger,

    whyNow,
    whyNotStronger,

    evidence: v.evidence,
    freshness,
    readiness,

    sourceRefs: {
      candidateId: v.candidateId,
      verdictId: v.verdictId,
      governanceDecisionId: g.governanceDecisionId,
    },
  };
}

/* ── Fallback truth for missing data ── */
export function emptyTruth(symbol: string, reason?: string): TruthObject {
  return {
    truthId: `truth_empty_${Date.now()}`,
    symbol,
    market: "UNKNOWN",
    timeframe: "",
    timestamp: new Date().toISOString(),
    finalVerdict: "BLOCK",
    operatorAction: "NO_ACTION",
    confidenceClass: "INVALID",
    effectiveSize: 0,
    primaryReason: {
      code: "NO_DATA",
      label: reason ?? "No valid setup candidate",
      direction: "NEGATIVE",
      impact: 0,
    },
    reasonStack: [],
    upgradeTrigger: { code: "AWAIT_SCAN", label: "Awaiting scan results" },
    killTrigger: { code: "NONE", label: "No active setup to invalidate" },
    whyNow: "Symbol has no active setup on current scan.",
    whyNotStronger: "No candidate has been generated by the engine.",
    evidence: {
      regimeFit: 0, structureQuality: 0, timeConfluence: 0,
      volatilityAlignment: 0, participationFlow: 0, crossMarketConfirmation: 0,
      eventSafety: 0, extensionSafety: 0, symbolTrust: 0, modelHealth: 0,
    },
    freshness: {
      marketDataAgeSec: 0, verdictAgeSec: 0, governanceAgeSec: 0,
      readinessAgeSec: 0, dataState: "UNAVAILABLE",
    },
    readiness: {
      setupValid: false, executionReady: false, triggerHit: false,
      thesisState: "UNKNOWN",
    },
    sourceRefs: { candidateId: "", verdictId: "", governanceDecisionId: "" },
  };
}
