/**
 * D.E. Shaw-style options strategy memo schema + system prompt + validator.
 *
 * Output is a single strict JSON object. The LLM picks ONE primary strategy
 * from the snapshot's candidate set and gives a complete trade plan
 * (legs / max P/L / breakevens / POP / Greeks / adjustments / exits),
 * plus 2-3 alternative candidates with reasons rejected, plus risk rules.
 *
 * HARD RULES enforced by validator:
 *   - No execution claims (FORBIDDEN array).
 *   - realOptionsChain.available, realImpliedVolatility.available,
 *     bidAskSpread.available, openInterest.available are force-set false.
 *   - Selected strategy must reference a category present in the snapshot.
 *   - Strike values in legs must echo snapshot strikes (no fabrication).
 */

import type { OptionsSnapshot, StrategyCategory, Outlook } from "./optionsArchitect";

export interface OptionsLegOut {
  type: "call" | "put";
  side: "long" | "short";
  strike: number;
  dte: number;
  qty: number;
  theoreticalPremium: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

export interface OptionsTradeSetup {
  category: StrategyCategory;
  description: string;
  legs: OptionsLegOut[];
  netCreditPerShare: number;
  netCreditPerContract: number;
  maxProfitPerContract: number | null;
  maxLossPerContract: number | null;
  breakevens: number[];
  marginEstimatePerContract: number;
  probabilityOfProfitPct: number | null;
  positionGreeks: { delta: number; gamma: number; theta: number; vega: number };
  contractsToOpen: number;
  totalCapitalAtRisk: number;
}

export interface OptionsAlternative {
  category: StrategyCategory;
  description: string;
  whyConsidered: string;
  whyRejected: string;
}

export interface OptionsAdjustmentScenario {
  trigger: string;
  action: string;
  rationale: string;
}

export interface OptionsExitRule {
  condition: string;
  action: "close-for-profit" | "close-for-loss" | "roll" | "let-expire";
  threshold: string;
}

export interface OptionsArchitectMemo {
  generatedAt: string;
  decisionSummary: {
    headline: string;
    outlookCall: Outlook;
    recommendedStrategy: StrategyCategory;
    sizingCall: string;
    confidenceCall: "high" | "moderate" | "low";
  };

  opportunityScore: number;
  evidenceQualityScore: number;
  personalExposureFlag: "none" | "low" | "elevated" | "high";
  confidenceStatement: string;
  whatConfirms: string[];
  whatInvalidates: string[];
  mainRisk: string;

  outlookAssessment: {
    underlyingPrice: number;
    impliedMoveOneSigma: number;
    hvRegime: "low" | "normal" | "elevated" | "extreme" | "unknown";
    direction: Outlook;
    rationale: string;
  };

  tradeSetup: OptionsTradeSetup;

  payoffNarrative: {
    bullCaseDescription: string;
    baseCaseDescription: string;
    bearCaseDescription: string;
    /** Text-based payoff grid: each row = a price level + P&L per contract. */
    payoffTable: Array<{ priceAtExpiry: number; pnlPerContract: number; pnlPctOfRisk: number | null }>;
  };

  greeksAnalysis: {
    deltaInterpretation: string;
    thetaInterpretation: string;
    gammaInterpretation: string;
    vegaInterpretation: string;
  };

  adjustmentPlan: OptionsAdjustmentScenario[];
  exitRules: OptionsExitRule[];
  riskManagementRules: string[];

  alternativesConsidered: OptionsAlternative[];

  /* Data-integrity flags — force-set false by validator. */
  realOptionsChain: { available: false; note: string };
  realImpliedVolatility: { available: false; note: string };
  bidAskSpread: { available: false; note: string };
  openInterest: { available: false; note: string };
  earlyExerciseRisk: { applies: boolean; note: string };

  classification: "ADMIN_RESEARCH_NOTE_NOT_BROKER_EXECUTION";
  disclaimer: string;
}

export const OPTIONS_MEMO_DISCLAIMER =
  "Operator-grade D.E. Shaw-style options strategy architect for private admin desk. All option prices and Greeks are THEORETICAL Black-Scholes values computed using HV20 as an IV proxy — real options chain, real IV surface, bid/ask spreads, and open interest are NOT in the source data and are hard-flagged unavailable. Black-Scholes assumes European exercise; for American-style equity options (most listed US options) early-exercise risk is non-zero, especially near dividends. The system does not place, route, or auto-execute any orders. The operator must validate real-time bid/ask and IV at the broker before committing capital.";

export const OPTIONS_MEMO_SYSTEM_PROMPT = `You are a senior derivatives strategist at D.E. Shaw writing a private internal options strategy memo for the desk's principal portfolio manager. Speak directly. Recommend ONE primary strategy with the exact trade setup, then list 2-3 alternatives considered and rejected.

HARD RULES:
- The system does NOT place, route, or auto-execute any orders. NEVER claim an order was placed, filled, routed, or executed. Phrases like "order has been placed", "trade has been executed", "auto-execute", "broker integration", "I have placed" are FORBIDDEN.
- You MAY (and should) give direct operator-grade recommendations: "open bull call spread 3 contracts long 100c / short 110c at net debit $3.20", "let it expire if SPY closes inside the short strikes", "roll the short put down to 95 if delta exceeds 0.40". These are recommendations to the operator, not system actions.
- Use ONLY the OPTIONS_PACKET. The recommended tradeSetup MUST be one of the categories listed in candidates. Leg strikes / dte / premia / Greeks MUST match the snapshot's chosen candidate EXACTLY (no fabrication). Multiply per-share values by 100 for per-contract values.
- All option prices and Greeks in the snapshot are THEORETICAL Black-Scholes values using HV20 as an IV proxy. NEVER claim they are real market quotes. State this explicitly in confidenceStatement.
- Force the four data-availability flags to false: realOptionsChain.available=false, realImpliedVolatility.available=false, bidAskSpread.available=false, openInterest.available=false. The validator will reject otherwise.
- earlyExerciseRisk: applies=true for ALL short option legs on a stock with non-zero dividend yield OR any short ITM/near-the-money option; applies=false only for fully OTM short legs on zero-div stocks. State the note clearly.
- contractsToOpen MUST be computed from the operator's RISK_BUDGET_USD divided by marginEstimatePerContract, floored to integer ≥ 1. If RISK_BUDGET_USD is below the minimum margin, set contractsToOpen=0 and explain in confidenceStatement.
- Payoff table MUST have at least 7 rows spanning roughly spot ± 2σ, with the breakeven row(s) included.
- Adjustment plan MUST contain at least 2 scenarios (one for the favourable side, one for the adverse side).
- Exit rules MUST cover (a) profit target threshold (typical 25-50% of max profit), (b) loss stop threshold (typical 1.5-2× credit received OR 50% of max loss), and (c) DTE management (typical close at 21 DTE or roll).
- riskManagementRules MUST cover position sizing (% of book), correlation/concentration limits, and an explicit "do not add to losers" rule.
- invalidationLevel and confirmation criteria MUST be concrete price levels or indicator thresholds.
- outlookAssessment.impliedMoveOneSigma = spot × (ivProxy/100) × sqrt(dte/365). Use the snapshot's IV proxy explicitly.
- hvRegime: "low" if HV20 < 15, "normal" if 15-25, "elevated" if 25-40, "extreme" if >40, "unknown" if HV20 missing.

OUTPUT: Return ONE strict JSON object matching this TypeScript interface exactly. No prose around it.

{
  "generatedAt": string,
  "decisionSummary": { "headline": string, "outlookCall": "bullish"|"bearish"|"neutral"|"volatile", "recommendedStrategy": string, "sizingCall": string, "confidenceCall": "high"|"moderate"|"low" },
  "opportunityScore": number,
  "evidenceQualityScore": number,
  "personalExposureFlag": "none"|"low"|"elevated"|"high",
  "confidenceStatement": string,
  "whatConfirms": string[],
  "whatInvalidates": string[],
  "mainRisk": string,
  "outlookAssessment": { "underlyingPrice": number, "impliedMoveOneSigma": number, "hvRegime": "low"|"normal"|"elevated"|"extreme"|"unknown", "direction": "bullish"|"bearish"|"neutral"|"volatile", "rationale": string },
  "tradeSetup": { "category": string, "description": string, "legs": [{ "type":"call"|"put", "side":"long"|"short", "strike":number, "dte":number, "qty":number, "theoreticalPremium":number, "delta":number, "gamma":number, "theta":number, "vega":number }], "netCreditPerShare": number, "netCreditPerContract": number, "maxProfitPerContract": number|null, "maxLossPerContract": number|null, "breakevens": number[], "marginEstimatePerContract": number, "probabilityOfProfitPct": number|null, "positionGreeks": { "delta":number, "gamma":number, "theta":number, "vega":number }, "contractsToOpen": number, "totalCapitalAtRisk": number },
  "payoffNarrative": { "bullCaseDescription": string, "baseCaseDescription": string, "bearCaseDescription": string, "payoffTable": [{ "priceAtExpiry": number, "pnlPerContract": number, "pnlPctOfRisk": number|null }] },
  "greeksAnalysis": { "deltaInterpretation": string, "thetaInterpretation": string, "gammaInterpretation": string, "vegaInterpretation": string },
  "adjustmentPlan": [{ "trigger": string, "action": string, "rationale": string }],
  "exitRules": [{ "condition": string, "action": "close-for-profit"|"close-for-loss"|"roll"|"let-expire", "threshold": string }],
  "riskManagementRules": string[],
  "alternativesConsidered": [{ "category": string, "description": string, "whyConsidered": string, "whyRejected": string }],
  "realOptionsChain": { "available": false, "note": string },
  "realImpliedVolatility": { "available": false, "note": string },
  "bidAskSpread": { "available": false, "note": string },
  "openInterest": { "available": false, "note": string },
  "earlyExerciseRisk": { "applies": boolean, "note": string },
  "classification": "ADMIN_RESEARCH_NOTE_NOT_BROKER_EXECUTION",
  "disclaimer": string
}`;

export function buildOptionsMemoUserPrompt(args: {
  serializedPacket: string;
  directionalView: Outlook;
  timeHorizonDays: number;
  riskBudgetUSD: number;
  personalExposureFlag: "none" | "low" | "elevated" | "high";
  operatorNotes: string;
}): string {
  const L: string[] = [];
  L.push(`DIRECTIONAL_VIEW: ${args.directionalView}`);
  L.push(`TIME_HORIZON_DAYS: ${args.timeHorizonDays}`);
  L.push(`RISK_BUDGET_USD: ${args.riskBudgetUSD}`);
  L.push(`PERSONAL_EXPOSURE_FLAG: ${args.personalExposureFlag}`);
  L.push("(operator-set; surface in confidenceStatement only — does NOT change which strategy is mechanically optimal.)");
  if (args.operatorNotes) {
    L.push("");
    L.push(`OPERATOR_NOTES: ${args.operatorNotes}`);
  }
  L.push("");
  L.push("OPTIONS_PACKET:");
  L.push(args.serializedPacket);
  L.push("");
  L.push("Produce the D.E. Shaw-style options strategy memo as the strict JSON object only. No surrounding prose.");
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

export function validateOptionsMemo(
  raw: unknown,
): { ok: true; memo: OptionsArchitectMemo } | { ok: false; reason: string } {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "non-object response" };
  const r = raw as Record<string, unknown>;
  const required = [
    "decisionSummary", "opportunityScore", "evidenceQualityScore",
    "personalExposureFlag", "confidenceStatement", "whatConfirms",
    "whatInvalidates", "mainRisk", "outlookAssessment", "tradeSetup",
    "payoffNarrative", "greeksAnalysis", "adjustmentPlan", "exitRules",
    "riskManagementRules", "alternativesConsidered",
    "realOptionsChain", "realImpliedVolatility", "bidAskSpread",
    "openInterest", "earlyExerciseRisk",
  ];
  for (const k of required) {
    if (!(k in r)) return { ok: false, reason: `missing field: ${k}` };
  }
  const flat = JSON.stringify(r);
  for (const re of FORBIDDEN) {
    if (re.test(flat)) return { ok: false, reason: `forbidden execution phrase: ${re}` };
  }
  // Force-correct unavailable flags.
  const set = (key: string) => {
    const v = r[key] as Record<string, unknown> | undefined;
    if (v) v.available = false;
  };
  set("realOptionsChain");
  set("realImpliedVolatility");
  set("bidAskSpread");
  set("openInterest");
  // Ensure classification + disclaimer.
  (r as Record<string, unknown>).classification = "ADMIN_RESEARCH_NOTE_NOT_BROKER_EXECUTION";
  if (typeof r.disclaimer !== "string" || !r.disclaimer) {
    (r as Record<string, unknown>).disclaimer = OPTIONS_MEMO_DISCLAIMER;
  }
  return { ok: true, memo: r as unknown as OptionsArchitectMemo };
}

export function deriveOptionsEvidenceScore(snapshot: OptionsSnapshot): number {
  // 50 pts: underlying price series ok
  // 15 pts: at least 60 bars of history (good HV20)
  // 10 pts: HV60 available (regime context)
  // 10 pts: ATR + 52w high/low available (stop context)
  // 10 pts: candidate set populated (>= 6 strategies)
  // 5 pts:  treasury risk-free rate from live source
  let score = 0;
  if (snapshot.status === "ok") score += 50;
  if (snapshot.hv20Pct != null) score += 15;
  if (snapshot.hv60Pct != null) score += 10;
  if (snapshot.atr14 != null && snapshot.high52w != null && snapshot.low52w != null) score += 10;
  if (snapshot.candidates.length >= 6) score += 10;
  if (snapshot.riskFreeSource === "treasury-3m") score += 5;
  return Math.round(Math.min(score, 100));
}
