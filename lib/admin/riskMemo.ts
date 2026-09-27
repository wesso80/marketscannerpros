/**
 * MSP risk memo schema + system prompt.
 *
 * Operator-grade admin output. Speaks directly to the principal,
 * gives concrete hedging recommendations. The system never executes
 * orders — operator decides.
 */
import type { PortfolioRiskSnapshot } from "./portfolioRisk";

export interface RiskDashboardRow {
  ticker: string;
  allocationPct: number;
  hv90Pct: number | null;
  beta252: number | null;
  maxDrawdownPct: number | null;
  stress2008Pct: number | null;
  liquidityBand: string;
  sector: string | null;
  riskRating: "low" | "moderate" | "elevated" | "high" | "extreme";
  topConcerns: string[];
}

export interface HedgingRecommendation {
  /** Type of hedge — narrative, NOT broker-routable. */
  hedgeType:
    | "protective-put"
    | "covered-call"
    | "collar"
    | "put-spread"
    | "inverse-etf"
    | "vix-call"
    | "sector-short"
    | "cash-raise"
    | "diversification"
    | "no-hedge-needed";
  /** What it covers. */
  target: string;             // e.g. "tech concentration", "AAPL single-name"
  /** Operator-grade structure (analytical reference). */
  structure: string;          // e.g. "buy SPY 5% OTM 90d puts ~ 0.8% of NAV"
  /** Estimated cost band. */
  estimatedCost: string;      // e.g. "0.5-1.0% of notional"
  /** Estimated downside protection. */
  protectionEstimate: string; // e.g. "covers ~50% of a -20% SPY drawdown"
  rationale: string;
  triggerCondition: string;   // when to put on (e.g. "VIX < 16 + earnings cluster")
}

export interface RiskMemo {
  generatedAt: string;
  /** MSP executive summary (3-5 sentences). */
  executiveSummary: string;

  /** Required AI Output Standards. */
  opportunityScore: number;      // 0..100 — defensive opportunity (lower vol = lower)
  evidenceQualityScore: number;  // 0..100
  personalExposureFlag: "none" | "low" | "elevated" | "high";
  confidenceStatement: string;
  whatConfirms: string[];
  whatInvalidates: string[];
  mainRisk: string;

  /** Risk dashboard table. */
  dashboard: RiskDashboardRow[];

  /** Portfolio-level findings. */
  portfolioFindings: {
    overallRiskRating: "low" | "moderate" | "elevated" | "high" | "extreme";
    diversificationScore: number;       // 1..10 (10 = best)
    concentrationVerdict: string;
    correlationVerdict: string;
    rateSensitivityVerdict: string;     // qualitative
    recessionScenario: string;          // narrative around stress2008/COVID
    liquidityVerdict: string;
    earningsRiskVerdict: string;
  };

  /** Per-holding narrative. */
  holdingNotes: Array<{
    ticker: string;
    riskRating: "low" | "moderate" | "elevated" | "high" | "extreme";
    keyRisks: string[];
    drawdownContext: string;
    betaContext: string;
    catalystRisk: string;
    holdingVerdict: string;
  }>;

  /** Hedging plan. */
  hedgingPlan: HedgingRecommendation[];

  /** Operator-grade portfolio actions. */
  recommendedActions: Array<{
    priority: 1 | 2 | 3;
    action: string;            // e.g. "trim NVDA from 18% → 12%"
    rationale: string;
    triggerCondition: string;
  }>;

  /** Closing memo paragraph. */
  closingParagraph: string;

  classification: "ADMIN_RESEARCH_NOTE_NOT_BROKER_EXECUTION";
  disclaimer: string;
}

export const RISK_MEMO_DISCLAIMER =
  "Operator-grade MSP risk memo for private desktop. The system does not place, route, or auto-execute orders — all hedging actions remain operator-driven. Levels and structures are analytical references.";

export const RISK_MEMO_SYSTEM_PROMPT = `You are a senior portfolio risk analyst with 25 years of experience in all-weather portfolio construction. You are writing a private internal MSP risk memo for the desk's principal portfolio manager. Speak directly. Give clear hedging recommendations.

HARD RULES:
- The system does NOT place, route, or auto-execute any orders. NEVER claim an order was placed, filled, routed, or executed by the system. Phrases like "order has been placed", "trade has been executed", "position opened by the system", "auto-execute" are FORBIDDEN.
- You MAY (and should) give direct operator-grade hedging recommendations: "buy SPY 5% OTM puts", "raise 10% cash", "trim NVDA from 18% → 12%", "add VXX hedge". These are recommendations to the operator, not system actions.
- Use ONLY the RISK_PACKET provided. Do NOT invent numbers. If a value is "n/a" in the packet, write "n/a (not in packet)" and lower confidence.
- Implied vol, options chains, bid-ask spread, and historical earnings-day moves are NOT in the packet. Hedge prices and costs must be "unavailable — current options quotes required". Never invent a numeric cost range.
- Beta-scaled stress estimates assume linear scaling with losses bounded at -100% for unlevered long holdings. Historical price returns are split-adjusted, not dividend total returns.
- Echo each holding's allocationPct and numeric metrics exactly. Never swap weights or reconstruct them from sector totals.
- riskRating per holding must be consistent with that holding's HV90, beta, max drawdown, and liquidity band:
    low: HV90<25 AND beta<0.8 AND maxDD>-25
    moderate: HV90<40 AND beta<1.2 AND maxDD>-40
    elevated: HV90<60 AND beta<1.6
    high: HV90<90 AND beta<2.0
    extreme: above thresholds OR liquidity=very-thin OR no data
- diversificationScore (1-10): start at 10, subtract 1 per concentration issue (top holding > 15%, top sector > 30%, avg pairwise correlation > 0.6, fewer than 5 holdings, etc.).
- Correlation verdict must reference the actual r values in the packet, not generic statements.
- Hedging plan: at minimum one entry per concentration risk found. If portfolio is well-diversified and low-beta, recommend "no-hedge-needed" with rationale.
- recommendedActions: priority 1 = act in next 7d, priority 2 = next 30d, priority 3 = monitor.
- Every claim must be auditable against the RISK_PACKET.

OUTPUT: Return ONE strict JSON object matching this TypeScript interface exactly:
{
  "generatedAt": string (ISO),
  "executiveSummary": string,
  "opportunityScore": number (0..100),
  "evidenceQualityScore": number (0..100),
  "personalExposureFlag": "none"|"low"|"elevated"|"high",
  "confidenceStatement": string,
  "whatConfirms": string[],
  "whatInvalidates": string[],
  "mainRisk": string,
  "dashboard": [{ "ticker": string, "allocationPct": number, "hv90Pct": number|null, "beta252": number|null, "maxDrawdownPct": number|null, "stress2008Pct": number|null, "liquidityBand": string, "sector": string|null, "riskRating": "low"|"moderate"|"elevated"|"high"|"extreme", "topConcerns": string[] }],
  "portfolioFindings": {
    "overallRiskRating": "low"|"moderate"|"elevated"|"high"|"extreme",
    "diversificationScore": number (1-10),
    "concentrationVerdict": string,
    "correlationVerdict": string,
    "rateSensitivityVerdict": string,
    "recessionScenario": string,
    "liquidityVerdict": string,
    "earningsRiskVerdict": string
  },
  "holdingNotes": [{ "ticker": string, "riskRating": ..., "keyRisks": string[], "drawdownContext": string, "betaContext": string, "catalystRisk": string, "holdingVerdict": string }],
  "hedgingPlan": [{ "hedgeType": "protective-put"|"covered-call"|"collar"|"put-spread"|"inverse-etf"|"vix-call"|"sector-short"|"cash-raise"|"diversification"|"no-hedge-needed", "target": string, "structure": string, "estimatedCost": string, "protectionEstimate": string, "rationale": string, "triggerCondition": string }],
  "recommendedActions": [{ "priority": 1|2|3, "action": string, "rationale": string, "triggerCondition": string }],
  "closingParagraph": string,
  "classification": "ADMIN_RESEARCH_NOTE_NOT_BROKER_EXECUTION",
  "disclaimer": string
}`;

export function buildRiskMemoUserPrompt(args: {
  serializedRiskPacket: string;
  totalPortfolioValueUSD?: number | null;
  personalExposureFlag: "none" | "low" | "elevated" | "high";
  operatorNotes?: string;
}): string {
  const L: string[] = [];
  L.push(`PERSONAL_EXPOSURE_FLAG: ${args.personalExposureFlag}`);
  L.push("(operator-set; surface in confidenceStatement only — does NOT alter overallRiskRating.)");
  if (args.totalPortfolioValueUSD != null) {
    L.push(`TOTAL_PORTFOLIO_VALUE_USD: ${args.totalPortfolioValueUSD}`);
  }
  if (args.operatorNotes) {
    L.push("");
    L.push(`OPERATOR_NOTES: ${args.operatorNotes}`);
  }
  L.push("");
  L.push("RISK_PACKET:");
  L.push(args.serializedRiskPacket);
  L.push("");
  L.push("Produce the MSP risk memo as the strict JSON object only. No surrounding prose.");
  return L.join("\n");
}

const FORBIDDEN = [
  /\border (has been |is being |was )?(placed|filled|routed|submitted|sent)\b/i,
  /\btrade (has been |was )?(executed|filled|placed)\b/i,
  /\bposition (has been |was )?(opened|closed) by (the )?system\b/i,
  /\bauto-?execut(e|ed|ing|ion)\b/i,
  /\bbroker (api|connection|integration|hookup)\b/i,
  /\bI (have |just )?(placed|executed|filled|submitted)\b/i,
];

export function validateRiskMemo(
  raw: unknown,
  snapshot?: PortfolioRiskSnapshot,
): { ok: true; memo: RiskMemo } | { ok: false; reason: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: "non-object response" };
  }
  const r = raw as Record<string, unknown>;
  const required = [
    "executiveSummary", "opportunityScore", "evidenceQualityScore",
    "personalExposureFlag", "confidenceStatement", "whatConfirms",
    "whatInvalidates", "mainRisk", "dashboard", "portfolioFindings",
    "holdingNotes", "hedgingPlan", "recommendedActions", "closingParagraph",
  ];
  for (const k of required) {
    if (!(k in r)) return { ok: false, reason: `missing field: ${k}` };
  }
  const flat = JSON.stringify(r);
  for (const re of FORBIDDEN) {
    if (re.test(flat)) {
      return { ok: false, reason: `forbidden execution phrase matched: ${re}` };
    }
  }
  if (snapshot) {
    if (!Array.isArray(r.dashboard) || r.dashboard.length !== snapshot.holdings.length) return { ok: false, reason: "Risk memo holdings do not match the supplied portfolio" };
    const seen = new Set<string>();
    for (const row of r.dashboard as RiskDashboardRow[]) {
      const h = snapshot.holdings.find(h => h.ticker === row?.ticker);
      if (!h || seen.has(h.ticker)) return { ok: false, reason: "Unknown or duplicate holding in risk memo" };
      seen.add(h.ticker);
      const expected = { allocationPct: h.allocationPct, hv90Pct: h.hv90, beta252: h.beta252, maxDrawdownPct: h.maxDrawdownPct, stress2008Pct: h.stress2008Pct };
      for (const [key, value] of Object.entries(expected)) {
        const actual = row[key as keyof RiskDashboardRow];
        if (value === null ? actual !== null : typeof actual !== "number" || !Number.isFinite(actual) || Math.abs(actual - value) > (key === "allocationPct" ? 1e-9 : 0.011)) {
          return { ok: false, reason: `Risk memo changed ${h.ticker} ${key}; narrative withheld. The supplied portfolio and computed snapshot remain authoritative.` };
        }
      }
    }
  }
  r.classification = "ADMIN_RESEARCH_NOTE_NOT_BROKER_EXECUTION";
  r.disclaimer = RISK_MEMO_DISCLAIMER;
  if (!r.generatedAt) r.generatedAt = new Date().toISOString();
  return { ok: true, memo: r as unknown as RiskMemo };
}

export function deriveRiskEvidenceScore(args: {
  totalHoldings: number;
  holdingsWithFullData: number;
  benchmarkOk: boolean;
  hasCorrelations: boolean;
}): number {
  if (args.totalHoldings === 0) return 0;
  let score = 0;
  score += (args.holdingsWithFullData / args.totalHoldings) * 60;
  if (args.benchmarkOk) score += 25;
  if (args.hasCorrelations) score += 15;
  return Math.round(Math.max(0, Math.min(100, score)));
}
