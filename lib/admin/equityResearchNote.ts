/**
 * Equity Research Note — MSP fundamental brief.
 *
 * Strict, fixed-schema research output for the admin terminal. NEVER
 * an order, NEVER execution language. All AI Output Standards fields
 * present:
 *   - Opportunity Score (0..100, structured)
 *   - Evidence Quality Score (0..100, mirrors fundamentals coverage)
 *   - Personal Exposure Flag (operator-set, not derived)
 *   - Confidence statement
 *   - What confirms / What invalidates / Main risk
 */

import type { FundamentalsBundle } from "./fundamentals";

export interface EquityResearchRating {
  /** buy | hold | avoid — the analyst verdict. */
  verdict: "buy" | "hold" | "avoid";
  /** Conviction 1..5 — analyst confidence in the verdict. */
  conviction: 1 | 2 | 3 | 4 | 5;
  /** 12-month bull-case price target (USD). null if cannot derive. */
  bullTarget: number | null;
  /** 12-month bear-case price target (USD). null if cannot derive. */
  bearTarget: number | null;
}

/** Operator-grade recommended action. The system never executes —
 *  the operator does. */
export interface RecommendedAction {
  action:
    | "accumulate"
    | "initiate"
    | "add"
    | "hold"
    | "trim"
    | "exit"
    | "avoid"
    | "short";
  sizing: string;            // e.g. "start 1/3 position, scale on weakness"
  timeHorizon: string;       // e.g. "6-18 months"
  triggerCondition: string;  // e.g. "on next pullback to 50DMA" or "n/a"
  rationale: string;
}

export interface MoatScores {
  pricingPower: number;          // 1..10
  brandStrength: number;         // 1..10
  switchingCosts: number;        // 1..10
  networkEffects: number;        // 1..10
}

export interface EquityResearchNote {
  ticker: string;
  generatedAt: string;
  rating: EquityResearchRating;
  recommendedAction: RecommendedAction;
  /** Required AI Output Standards fields. */
  opportunityScore: number;          // 0..100
  evidenceQualityScore: number;      // 0..100
  personalExposureFlag: "none" | "low" | "elevated" | "high";
  confidenceStatement: string;
  whatConfirms: string[];
  whatInvalidates: string[];
  mainRisk: string;
  /** MSP research note body, fielded. */
  businessModel: string;
  revenueStreams: Array<{ segment: string; share: string; growth: string }>;
  profitability: {
    grossMarginTrend: string;
    operatingMarginTrend: string;
    netMarginTrend: string;
  };
  balanceSheet: {
    debtToEquity: string;
    currentRatio: string;
    cashVsDebt: string;
  };
  freeCashFlow: {
    fcfYield: string;
    fcfGrowth: string;
    capitalAllocation: string;
  };
  moat: MoatScores;
  management: string;
  valuation: {
    peVsHistory: string;
    psVsHistory: string;
    evEbitdaVsPeers: string;
  };
  bullCase: string;
  bearCase: string;
  verdictParagraph: string;
  classification: "ADMIN_RESEARCH_NOTE_NOT_BROKER_EXECUTION";
}

/* ───────────── Prompt builders ───────────── */

export const EQUITY_RESEARCH_SYSTEM_PROMPT = `You are a senior buy-side equity research analyst (20 yrs) writing a private MSP research note for the desk's principal. The reader IS the operator and decision-maker. Speak directly. Give a clear recommended action.

HARD RULES:
- The system does NOT place, route, or auto-execute any orders. NEVER claim an order was placed, filled, routed, or executed by the system. Phrases like "order has been placed", "trade has been executed", "position opened by the system", and "auto-execute" are FORBIDDEN.
- You MAY (and should) give direct operator-grade calls: "accumulate on weakness", "initiate a starter position", "trim into strength", "avoid". These are recommendations to the operator, not system actions.
- Use ONLY the FUNDAMENTALS_PACKET provided. Do NOT invent numbers. If a number is missing, write "n/a (not in packet)" — never substitute estimates.
- If the packet is sparse (missing endpoints, rate-limited, or empty), reduce conviction and shorten the note. Do not pad with prose.
- Verdict: buy / hold / avoid. Conviction 1..5 — never higher than the evidence supports.
- recommendedAction.sizing is qualitative (e.g. "starter", "1/3 position", "full") — the operator owns book context.
- recommendedAction.action must be consistent with rating.verdict (e.g. verdict=avoid → action in {avoid, exit, short}).
- Every claim must be auditable against the FUNDAMENTALS_PACKET.

OUTPUT: Return ONE strict JSON object matching this TypeScript interface exactly:
{
  "ticker": string,
  "generatedAt": string (ISO),
  "rating": { "verdict": "buy"|"hold"|"avoid", "conviction": 1|2|3|4|5, "bullTarget": number|null, "bearTarget": number|null },
  "recommendedAction": {
    "action": "accumulate"|"initiate"|"add"|"hold"|"trim"|"exit"|"avoid"|"short",
    "sizing": string,
    "timeHorizon": string,
    "triggerCondition": string,
    "rationale": string
  },
  "opportunityScore": number (0..100),
  "evidenceQualityScore": number (0..100),
  "personalExposureFlag": "none"|"low"|"elevated"|"high",
  "confidenceStatement": string,
  "whatConfirms": string[],
  "whatInvalidates": string[],
  "mainRisk": string,
  "businessModel": string,
  "revenueStreams": [{ "segment": string, "share": string, "growth": string }],
  "profitability": { "grossMarginTrend": string, "operatingMarginTrend": string, "netMarginTrend": string },
  "balanceSheet": { "debtToEquity": string, "currentRatio": string, "cashVsDebt": string },
  "freeCashFlow": { "fcfYield": string, "fcfGrowth": string, "capitalAllocation": string },
  "moat": { "pricingPower": 1-10, "brandStrength": 1-10, "switchingCosts": 1-10, "networkEffects": 1-10 },
  "management": string,
  "valuation": { "peVsHistory": string, "psVsHistory": string, "evEbitdaVsPeers": string },
  "bullCase": string,
  "bearCase": string,
  "verdictParagraph": string,
  "classification": "ADMIN_RESEARCH_NOTE_NOT_BROKER_EXECUTION"
}`;

export function buildEquityResearchUserPrompt(args: {
  ticker: string;
  fundamentalsSerialized: string;
  operatorNotes?: string;
  personalExposureFlag: "none" | "low" | "elevated" | "high";
}): string {
  const lines: string[] = [];
  lines.push(`TICKER: ${args.ticker}`);
  lines.push(`PERSONAL_EXPOSURE_FLAG: ${args.personalExposureFlag}`);
  lines.push(
    "(personal exposure is operator-set; it MUST NOT alter your verdict — surface it in confidenceStatement only)",
  );
  if (args.operatorNotes) {
    lines.push("");
    lines.push(`OPERATOR_NOTES: ${args.operatorNotes}`);
  }
  lines.push("");
  lines.push("FUNDAMENTALS_PACKET:");
  lines.push(args.fundamentalsSerialized);
  lines.push("");
  lines.push(
    "Produce the MSP research note as the strict JSON object only. No surrounding prose.",
  );
  return lines.join("\n");
}

/* ───────────── Validation ───────────── */

/**
 * Only block phrases that imply the SYSTEM executed an order.
 * Operator-directed language ("accumulate", "trim", "exit") is allowed.
 */
const FORBIDDEN_PHRASES = [
  /\border (has been |is being |was )?(placed|filled|routed|submitted|sent)\b/i,
  /\btrade (has been |was )?(executed|filled|placed)\b/i,
  /\bposition (has been |was )?(opened|closed) by (the )?system\b/i,
  /\bauto-?execut(e|ed|ing|ion)\b/i,
  /\bbroker (api|connection|integration|hookup)\b/i,
  /\bI (have |just )?(placed|executed|filled|submitted)\b/i,
];

export function validateEquityResearchNote(
  raw: unknown,
): { ok: true; note: EquityResearchNote } | { ok: false; reason: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: "non-object response" };
  }
  const r = raw as Record<string, unknown>;
  const required = [
    "ticker", "rating", "recommendedAction", "opportunityScore",
    "evidenceQualityScore", "personalExposureFlag", "confidenceStatement",
    "whatConfirms", "whatInvalidates", "mainRisk", "businessModel",
    "revenueStreams", "profitability", "balanceSheet", "freeCashFlow",
    "moat", "management", "valuation", "bullCase", "bearCase",
    "verdictParagraph",
  ];
  for (const k of required) {
    if (!(k in r)) return { ok: false, reason: `missing field: ${k}` };
  }
  const flat = JSON.stringify(r);
  for (const re of FORBIDDEN_PHRASES) {
    if (re.test(flat)) {
      return { ok: false, reason: `forbidden execution phrase matched: ${re}` };
    }
  }
  // Force classification regardless of model output.
  r.classification = "ADMIN_RESEARCH_NOTE_NOT_BROKER_EXECUTION";
  if (!r.generatedAt) r.generatedAt = new Date().toISOString();
  return { ok: true, note: r as unknown as EquityResearchNote };
}

/** Map FundamentalsBundle coverage to a 0..100 evidence score. */
export function deriveEvidenceQualityScore(b: FundamentalsBundle): number {
  const total = Object.keys(b.endpointStatus).length || 1;
  const okCount = Object.values(b.endpointStatus).filter((s) => s === "ok")
    .length;
  return Math.round((okCount / total) * 100);
}
