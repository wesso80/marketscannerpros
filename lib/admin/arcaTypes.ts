/**
 * Phase 6 — ARCA Admin Research Copilot types
 *
 * Internal-only research copilot. ARCA = Admin Research Copilot Agent.
 * Bound to InternalResearchScore + EvidenceStack + DataTruth so it can
 * never speak outside the data the operator is actually looking at.
 *
 * BOUNDARY: ARCA is forbidden from emitting execution-grade language
 * (buy / sell / execute / place order / position size / deploy). The
 * server prompt enforces this; the output schema does not contain any
 * field that could carry an order instruction.
 */

import type {
  InternalResearchScore,
  ResearchScoreAxes,
} from "@/lib/admin/adminTypes";
import type { DataTruth } from "@/lib/engines/dataTruth";
import type { ArcaBrainEvidence } from "@/lib/admin/arcaBrainBridge";

/* ───────────── Modes ───────────── */

export type ArcaAdminMode =
  | "BEST_PLAYS"
  | "ATTENTION_NOW"
  | "RED_TEAM_SETUP"
  | "CHALLENGE_MY_BIAS"
  | "MARKET_REGIME_BRIEF"
  | "EARNINGS_RISK_BRIEF"
  | "CRYPTO_RISK_BRIEF"
  | "OPTIONS_PRESSURE_BRIEF"
  | "WHAT_CHANGED_SINCE_LAST_SCAN"
  | "WHY_IS_THIS_RANKED"
  | "WHAT_AM_I_MISSING"
  | "DESK_READ";

export const ARCA_ADMIN_MODES: readonly ArcaAdminMode[] = [
  "BEST_PLAYS",
  "ATTENTION_NOW",
  "RED_TEAM_SETUP",
  "CHALLENGE_MY_BIAS",
  "MARKET_REGIME_BRIEF",
  "EARNINGS_RISK_BRIEF",
  "CRYPTO_RISK_BRIEF",
  "OPTIONS_PRESSURE_BRIEF",
  "WHAT_CHANGED_SINCE_LAST_SCAN",
  "WHY_IS_THIS_RANKED",
  "WHAT_AM_I_MISSING",
  "DESK_READ",
] as const;

export const ARCA_MODE_LABELS: Record<ArcaAdminMode, string> = {
  BEST_PLAYS: "Best Plays",
  ATTENTION_NOW: "What Deserves Attention Now",
  RED_TEAM_SETUP: "Red Team Setup",
  CHALLENGE_MY_BIAS: "Challenge My Bias",
  MARKET_REGIME_BRIEF: "Market Regime Brief",
  EARNINGS_RISK_BRIEF: "Earnings Risk Brief",
  CRYPTO_RISK_BRIEF: "Crypto Risk Brief",
  OPTIONS_PRESSURE_BRIEF: "Options Pressure Brief",
  WHAT_CHANGED_SINCE_LAST_SCAN: "What Changed Since Last Scan",
  WHY_IS_THIS_RANKED: "Why Is This Ranked?",
  WHAT_AM_I_MISSING: "What Am I Missing?",
  DESK_READ: "Desk Read",
};

/* ───────────── Desk Read schema ───────────── */

export type SetupAge = "early" | "active" | "late" | "dead";

/**
 * Fixed-schema chief-analyst desk read. Rendered by the homepage
 * <ArcaDeskReadPanel/>. Every field is research-only language.
 */
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

/* ───────────── Context bound to the cockpit ───────────── */

export interface ArcaAdminContext {
  symbol: string;
  market: string;
  timeframe: string;
  bias: string;
  setup: string;
  score: Pick<InternalResearchScore, "score" | "lifecycle" | "axes" | "dominantAxis">;
  dataTruth: Pick<DataTruth, "status" | "trustScore">;
  /** Canonical research packet subset to ground every response. */
  packet?: {
    trustAdjustedScore: number;
    scoreDecayReason: string;
    contradictionFlags: string[];
    nextResearchChecks: string[];
    invalidationConditions: string[];
    trapRiskScore: number;
  };
  /** Optional comparison context for cross-symbol briefing modes. */
  compareTo?: {
    symbol: string;
    score: number;
    axes: ResearchScoreAxes;
  };
  /** Optional previous-scan delta (used by WHAT_CHANGED_SINCE_LAST_SCAN). */
  previous?: {
    score: number;
    axes: ResearchScoreAxes;
    capturedAt: string;
  };
  /**
   * Phase 7 — sanitized Brain Layer evidence packet. Built via
   * `lib/admin/arcaBrainBridge.ts#buildArcaBrainEvidence`. ARCA must
   * surface the downgrade reasons / sample size / freshness from this
   * object verbatim per the language rules.
   */
  brainEvidence?: ArcaBrainEvidence;
}

/* ───────────── Output schema (enforced) ───────────── */

export interface ArcaAdminResearchOutput {
  mode: ArcaAdminMode;
  symbol: string;
  /** 1–2 sentence operator-grade headline. Direct desk language allowed. Never claim execution. */
  headline: string;
  /** Bullet points of the reasoning the operator can audit. */
  reasoning: string[];
  /** Concrete evidence referenced (axes, dataTruth fields, levels). */
  evidence: string[];
  /** Risks / counter-thesis the operator should weigh. */
  risks: string[];
  /** Field paths or keys from the bound context that grounded each claim. */
  groundingCitations?: string[];
  /** 'No stored data supports that.'-style notices for any dropped/ungrounded claim, else empty string. */
  unsupportedClaimNotice?: string;
  /** Either of two acceptable classifications (legacy + admin-desk). */
  classification:
    | "ADMIN_RESEARCH_COPILOT_NOT_BROKER_EXECUTION"
    | "ADMIN_DESK_COPILOT_NOT_BROKER_EXECUTION";
}

/* ───────────── Output validation ───────────── */

export interface ArcaValidationResult {
  ok: boolean;
  errors: string[];
  output?: ArcaAdminResearchOutput;
}

const FORBIDDEN_OUTPUT_PHRASES = [
  // Substring match, case-insensitive. Any of these in any field => reject.
  // These all imply broker execution — still hard-banned even in admin desk mode.
  "place order",
  "placed order",
  "send to broker",
  "route to broker",
  "submit order",
  "submitted order",
  "executed order",
  "order has been placed",
  "order has been routed",
  "auto trade",
  "auto-trade",
  "auto execute",
  "auto-execute",
  "trade has been executed",
  "position has been opened",
  "position has been closed",
];

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export function validateArcaOutput(raw: unknown, expectedMode: ArcaAdminMode, expectedSymbol: string): ArcaValidationResult {
  return validateArcaOutputWithEvidence(raw, expectedMode, expectedSymbol);
}

/**
 * Phase 7 — extended validator. When a brainEvidence packet is supplied,
 * enforces the ARCA language rules:
 *   - If sample size is small,                    output must say so.
 *   - If edge tier is insufficient_sample,        output must say so.
 *   - If setup historically fails in this regime, output must say so.
 *   - If evidence/buckets are missing,            output must say so.
 *   - If freshness is stale/simulated/unknown,    output must say so.
 *   - Never convert a weak edge into confident language.
 */
export function validateArcaOutputWithEvidence(
  raw: unknown,
  expectedMode: ArcaAdminMode,
  expectedSymbol: string,
  evidence?: ArcaBrainEvidence,
): ArcaValidationResult {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: ["Output is not an object"] };
  }
  const o = raw as Record<string, unknown>;

  if (o.mode !== expectedMode) errors.push(`mode mismatch (expected ${expectedMode})`);
  if (typeof o.symbol !== "string" || o.symbol.toUpperCase() !== expectedSymbol.toUpperCase()) {
    errors.push("symbol mismatch");
  }
  if (typeof o.headline !== "string" || o.headline.trim().length < 4) {
    errors.push("headline missing or too short");
  }
  if (!isStringArray(o.reasoning)) errors.push("reasoning must be string[]");
  if (!isStringArray(o.evidence)) errors.push("evidence must be string[]");
  if (!isStringArray(o.risks)) errors.push("risks must be string[]");
  if (
    o.classification !== "ADMIN_RESEARCH_COPILOT_NOT_BROKER_EXECUTION" &&
    o.classification !== "ADMIN_DESK_COPILOT_NOT_BROKER_EXECUTION"
  ) {
    errors.push("classification must be ADMIN_RESEARCH_COPILOT_NOT_BROKER_EXECUTION or ADMIN_DESK_COPILOT_NOT_BROKER_EXECUTION");
  }

  // Forbidden-phrase scan across all text fields.
  if (errors.length === 0) {
    const corpus = [
      o.headline as string,
      ...(o.reasoning as string[]),
      ...(o.evidence as string[]),
      ...(o.risks as string[]),
    ]
      .join("\n")
      .toLowerCase();
    for (const phrase of FORBIDDEN_OUTPUT_PHRASES) {
      if (corpus.includes(phrase)) {
        errors.push(`forbidden phrase in output: "${phrase}"`);
      }
    }

    // Phase 7 language-rule enforcement (only when evidence is supplied).
    if (evidence) {
      const must = (needles: string[], rule: string) => {
        if (!needles.some((n) => corpus.includes(n))) {
          errors.push(`language rule violated: ${rule} (corpus must contain one of: ${needles.map((n) => `"${n}"`).join(", ")})`);
        }
      };

      const n = evidence.sampleSize.n;
      if (evidence.sampleSize.classification === 'none' || evidence.sampleSize.classification === 'insufficient') {
        must(['insufficient sample', 'sample size', 'too few', 'unproven', 'no historical edge'], 'small/insufficient sample must be acknowledged');
      } else if (evidence.sampleSize.classification === 'thin') {
        must(['thin sample', 'small sample', `n=${n}`, 'limited history', 'provisional'], 'thin sample must be acknowledged');
      }

      if (evidence.historicalEdge?.edgeTier === 'insufficient_sample' || !evidence.historicalEdge) {
        must(['edge is unproven', 'unproven edge', 'no proven edge', 'insufficient sample', 'historical edge cannot'], 'unproven edge must be acknowledged');
      }

      if (evidence.regimeFit.failedInRegime !== null && evidence.regimeFit.failedInRegime > 0.6) {
        must(['fails in this regime', 'historically fails', 'poor regime fit', 'regime headwind'], 'historical failure in current regime must be acknowledged');
      }

      if (evidence.missingData.missingCount > 0 || evidence.missingData.missingBuckets.length > 0) {
        must(['missing data', 'missing evidence', 'evidence gap', 'feature gap', 'incomplete'], 'missing evidence must be acknowledged');
      }

      if (evidence.freshness.label === 'stale') {
        must(['stale data', 'not live', 'is stale'], 'stale data must be acknowledged');
      }
      if (evidence.freshness.label === 'simulated') {
        must(['simulated', 'mock', 'not real'], 'simulated data must be acknowledged');
      }
      if (evidence.freshness.label === 'unknown') {
        must(['freshness unknown', 'unknown freshness', 'cannot certify'], 'unknown freshness must be acknowledged');
      }
      if (evidence.edgeDecay.detected) {
        must(['edge decay', 'losing edge', 'recent underperformance', 'decaying'], 'edge decay must be acknowledged');
      }

      // Anti-overconfidence: if edge is weak/unproven, headline must not assert high confidence.
      const headlineLc = (o.headline as string).toLowerCase();
      const isWeakEdge =
        !evidence.historicalEdge ||
        evidence.historicalEdge.edgeTier === 'insufficient_sample' ||
        evidence.historicalEdge.edgeTier === 'noise' ||
        evidence.historicalEdge.edgeTier === 'weak' ||
        evidence.sampleSize.classification === 'insufficient' ||
        evidence.sampleSize.classification === 'thin';
      const overconfidentPhrases = [
        'high conviction',
        'high confidence',
        'strong conviction',
        'highly confident',
        'definitely',
        'certainly',
        'guaranteed',
      ];
      if (isWeakEdge) {
        for (const p of overconfidentPhrases) {
          if (headlineLc.includes(p)) {
            errors.push(`overconfidence violation: weak edge cannot use "${p}" in headline`);
          }
        }
      }
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], output: o as unknown as ArcaAdminResearchOutput };
}
