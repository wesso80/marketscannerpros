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
  | "WHAT_AM_I_MISSING";

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
};

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
}

/* ───────────── Output schema (enforced) ───────────── */

export interface ArcaAdminResearchOutput {
  mode: ArcaAdminMode;
  symbol: string;
  /** 1–2 sentence research-grade headline. Never an instruction. */
  headline: string;
  /** Bullet points of the reasoning the operator can audit. */
  reasoning: string[];
  /** Concrete evidence referenced (axes, dataTruth fields, levels). */
  evidence: string[];
  /** Risks / counter-thesis the operator should weigh. */
  risks: string[];
  /** Always present, always exactly this string. */
  classification: "ADMIN_RESEARCH_COPILOT_NOT_BROKER_EXECUTION";
}

/* ───────────── Output validation ───────────── */

export interface ArcaValidationResult {
  ok: boolean;
  errors: string[];
  output?: ArcaAdminResearchOutput;
}

const FORBIDDEN_OUTPUT_PHRASES = [
  // Substring match, case-insensitive. Any of these in any field => reject.
  "buy now",
  "sell now",
  "place order",
  "execute trade",
  "execute now",
  "send to broker",
  "position size",
  "deploy capital",
  "auto trade",
];

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export function validateArcaOutput(raw: unknown, expectedMode: ArcaAdminMode, expectedSymbol: string): ArcaValidationResult {
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
  if (o.classification !== "ADMIN_RESEARCH_COPILOT_NOT_BROKER_EXECUTION") {
    errors.push("classification must be ADMIN_RESEARCH_COPILOT_NOT_BROKER_EXECUTION");
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
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], output: o as unknown as ArcaAdminResearchOutput };
}
