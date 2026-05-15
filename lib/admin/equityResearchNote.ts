/**
 * Equity Research Note — Goldman Sachs–style fundamental brief.
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
  /** buy | hold | avoid — research-only verdict, not a broker action. */
  verdict: "buy" | "hold" | "avoid";
  /** Conviction 1..5 — analyst confidence in the verdict. */
  conviction: 1 | 2 | 3 | 4 | 5;
  /** 12-month bull-case price target (USD). null if cannot derive. */
  bullTarget: number | null;
  /** 12-month bear-case price target (USD). null if cannot derive. */
  bearTarget: number | null;
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
  /** Required AI Output Standards fields. */
  opportunityScore: number;          // 0..100
  evidenceQualityScore: number;      // 0..100
  personalExposureFlag: "none" | "low" | "elevated" | "high";
  confidenceStatement: string;
  whatConfirms: string[];
  whatInvalidates: string[];
  mainRisk: string;
  /** Goldman-style research note body, fielded. */
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

export const EQUITY_RESEARCH_SYSTEM_PROMPT = `You are a senior equity research analyst writing a private research note for an internal investment committee. You have 20 years of buy-side experience.

HARD RULES:
- This is RESEARCH ONLY. You are not a broker. You do NOT place orders. You do NOT recommend position sizes. The words "buy now", "sell now", "execute", "deploy capital", "place order", and "open a position" are FORBIDDEN.
- Use ONLY the FUNDAMENTALS_PACKET provided. Do NOT invent numbers. If a number is missing from the packet, write "n/a (not in packet)" — never substitute estimates.
- If the packet is sparse (missing endpoints, rate-limited, or empty), reduce confidence and shorten the note. Do not pad with prose.
- Verdict is one of: buy, hold, avoid — these are research-grade verdicts only, not execution instructions.
- Conviction 1..5 — never higher than the evidence supports.
- Every claim must be auditable against the FUNDAMENTALS_PACKET.

OUTPUT: Return ONE strict JSON object matching this TypeScript interface exactly:
{
  "ticker": string,
  "generatedAt": string (ISO),
  "rating": { "verdict": "buy"|"hold"|"avoid", "conviction": 1|2|3|4|5, "bullTarget": number|null, "bearTarget": number|null },
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
    "Produce the Goldman-style research note as the strict JSON object only. No surrounding prose.",
  );
  return lines.join("\n");
}

/* ───────────── Validation ───────────── */

const FORBIDDEN_PHRASES = [
  /\bbuy now\b/i,
  /\bsell now\b/i,
  /\bexecute (the )?(trade|order|position)\b/i,
  /\bplace (an )?order\b/i,
  /\bdeploy capital\b/i,
  /\bopen a position\b/i,
  /\bsize the position\b/i,
];

export function validateEquityResearchNote(
  raw: unknown,
): { ok: true; note: EquityResearchNote } | { ok: false; reason: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: "non-object response" };
  }
  const r = raw as Record<string, unknown>;
  const required = [
    "ticker", "rating", "opportunityScore", "evidenceQualityScore",
    "personalExposureFlag", "confidenceStatement", "whatConfirms",
    "whatInvalidates", "mainRisk", "businessModel", "revenueStreams",
    "profitability", "balanceSheet", "freeCashFlow", "moat",
    "management", "valuation", "bullCase", "bearCase",
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
