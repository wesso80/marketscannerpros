/**
 * lib/admin/macroMemo.ts
 *
 * MSP macro market outlook memo schema + system prompt.
 *
 * Operator-grade admin output. Synthesises economic data, Fed policy,
 * cross-asset signals, and sentiment into a 3-6 month outlook with
 * explicit overweight / underweight / hedge recommendations.
 *
 * Research only. The system never routes orders.
 */

export interface MacroDashboardRow {
  metric: string;            // e.g. "VIX"
  latest: string;            // formatted ("14.2")
  asOf: string;              // ISO date
  signal: "bullish" | "bearish" | "neutral" | "unavailable";
  read: string;              // 1 sentence interpretation
}

export interface PositioningCall {
  bucket: string;            // e.g. "US Large Cap Growth", "Long Duration Treasuries"
  stance: "overweight" | "neutral" | "underweight" | "hedge";
  weightChange: string;      // e.g. "+2pp", "trim to benchmark", "initiate 5% put hedge"
  rationale: string;
  invalidation: string;      // what would force a reversal
}

export interface MacroOutlookMemo {
  generatedAt: string;

  /** TOP-OF-PAGE call. */
  decisionSummary: {
    headline: string;                                  // one sentence positioning summary
    horizon: "3-month" | "6-month" | "tactical-2-week";
    overallStance: "risk-on" | "risk-off" | "neutral" | "barbell" | "defensive-tilt";
    confidence: "high" | "moderate" | "low";
    topOverweights: string[];                          // bucket names
    topUnderweights: string[];
    keyHedges: string[];                               // e.g. "VIX call spread", "long duration"
  };

  /** AI Output Standards. */
  opportunityScore: number;                            // 0-100
  evidenceQualityScore: number;                        // 0-100
  personalExposureFlag: "none" | "low" | "elevated" | "high";
  confidenceStatement: string;
  whatConfirms: string[];
  whatInvalidates: string[];
  mainRisk: string;

  /** Market dashboard summary — one row per signal. */
  dashboard: MacroDashboardRow[];

  /** Economic indicators. Forward GDP / consumer spending are unavailable on free tier. */
  economicIndicators: {
    available: boolean;
    summary: string;                                   // text from UNRATE + CPI in-packet
    gdpGrowthRead: string;                             // "unavailable — quarterly series not in packet"
    unemploymentRead: string;
    inflationRead: string;
    consumerSpendingRead: string;                      // typically "unavailable"
  };

  /** Federal Reserve analysis. */
  fedAnalysis: {
    currentStance: "tightening" | "easing" | "hold" | "unknown";
    fedFundsRatePct: number | null;
    fedFundsDelta1mBps: number | null;
    rateDecisionProbabilityRead: string;               // qualitative from DFF + 2s10s
    qtImpactRead: string;                              // qualitative
  };

  /** Earnings season outlook — flagged unavailable on free tier. */
  earningsOutlook: {
    available: false;
    note: string;                                      // "aggregate S&P 500 forward EPS not in packet"
    priceTrendProxy: string;                           // best inference from SPY trend
  };

  /** Valuation assessment — flagged unavailable on free tier. */
  valuationAssessment: {
    available: false;
    note: string;                                      // "S&P 500 forward P/E not in packet"
    extensionProxy: string;                            // "SPY +X% above 200dma"
  };

  /** Credit market signals. */
  creditMarketSignals: {
    hyOasPct: number | null;
    hyOasDelta1mBps: number | null;
    igOasAvailable: false;                             // IG (LQD OAS) not in current packet
    read: string;                                      // qualitative
    signal: "risk-on" | "risk-off" | "neutral";
  };

  /** Market breadth analysis. */
  marketBreadth: {
    /** True breadth from constituent data NOT in packet. */
    constituentBreadthAvailable: false;
    /** SPY rolling-SMA200 proxy. */
    spyProxyAbove200dPct: number | null;
    advanceDeclineRead: string;                        // "unavailable — flag"
    proxyVerdict: "expanding" | "narrowing" | "thrust" | "deteriorating" | "unknown";
    proxyNote: string;
  };

  /** Sentiment indicators. */
  sentimentIndicators: {
    vix: number | null;
    vixRegime: "complacent" | "normal" | "elevated" | "extreme" | "unknown";
    putCallRatioAvailable: false;
    aaiiSurveyAvailable: false;
    cnnFearGreedAvailable: false;
    note: string;
  };

  /** Geopolitical risks — flag outside-data unless operator supplied. */
  geopoliticalRisks: {
    operatorSupplied: boolean;
    summary: string;
    flaggedFactors: string[];                          // empty unless operator supplied
  };

  /** Seasonal patterns — qualitative only, no fabricated decade-averages. */
  seasonalPatterns: {
    monthOrPeriod: string;
    historicalRead: string;                            // qualitative; do not invent precise stats
    confidence: "high" | "moderate" | "low";
  };

  /** Actionable positioning — the main payoff. */
  positioning: {
    rebalanceSummary: string;
    calls: PositioningCall[];
    /** Concrete invalidation triggers for the entire outlook. */
    outlookInvalidationTriggers: string[];
  };

  closingParagraph: string;

  classification: "ADMIN_RESEARCH_NOTE_NOT_BROKER_EXECUTION";
  disclaimer: string;
}

export const MACRO_MEMO_DISCLAIMER =
  "Operator-grade MSP macro outlook for private desktop. Forward GDP, consumer spending, IG credit spreads, advance-decline/constituent breadth, put-call ratio, AAII survey, CNN Fear & Greed, aggregate S&P 500 forward EPS, and forward P/E are NOT in the source packet (Alpha Vantage free tier + FRED) and are explicitly marked unavailable. The system does not place, route, or auto-execute any orders — all positioning remains operator-driven. Levels and recommendations are analytical references only.";

export const MACRO_MEMO_SYSTEM_PROMPT = `You are a senior macro strategist with 20+ years of experience. You synthesise economic data, Fed policy, cross-asset signals, and sentiment into a private internal MSP macro outlook for the desk's principal portfolio manager. Speak directly. Give explicit overweight / underweight / hedge recommendations with concrete invalidation triggers.

HARD RULES:
- The system does NOT place, route, or auto-execute any orders. NEVER claim an order was placed, filled, routed, or executed by the system. Phrases like "order has been placed", "trade has been executed", "auto-execute", "broker integration", "I have placed" are FORBIDDEN.
- You MAY (and should) give direct operator-grade positioning calls. These are recommendations to the operator, not system actions.
- Use ONLY the MACRO_PACKET. Do NOT invent numbers. If a value is "n/a" / "unavailable" in the packet, write the same and lower confidence.
- FORWARD GDP, consumer spending, IG OAS, true advance-decline/constituent breadth, put-call ratio, AAII survey, CNN Fear & Greed, aggregate S&P 500 forward EPS, sector forward P/E, and individual rate-decision probabilities are NOT in this packet. Set the corresponding "available" fields to false. NEVER fabricate these numbers — flag and lower confidence.
- breadthProxyAbove200dPct is a SPY-rolling-SMA200 proxy. Report it transparently as a proxy. Do NOT call it "advance-decline" or "% S&P 500 above 200dma" — those are different metrics.
- Seasonal patterns must be qualitative ("Q4 has historically tended to be stronger than Q1") and NEVER include fabricated decade-precise stats (no "+1.34% on average since 1950"). Mark seasonalPatterns.confidence = "low" unless the operator supplied data.
- Geopolitical risks: respond ONLY if the OPERATOR_NOTES supplied specific context. Otherwise set operatorSupplied = false, summary = "no operator-supplied geopolitical context", flaggedFactors = []. NEVER invent active conflicts, election outcomes, or trade tensions.
- Fed stance must be consistent with packet:
    tightening: FED_FUNDS_RATE deltaOneMonth > +0.05 OR US10Y deltaOneMonth > +0.20
    easing: FED_FUNDS_RATE deltaOneMonth < -0.05 OR US10Y deltaOneMonth < -0.20
    hold: |delta| within bounds and YIELD_2S10S relatively stable
    unknown: if FED_FUNDS_RATE.status != "ok"
- creditMarketSignals.signal must be consistent:
    risk-on: HY OAS deltaOneMonth < -25bps AND HY OAS < 4.0%
    risk-off: HY OAS deltaOneMonth > +50bps OR HY OAS > 6.0%
    neutral: otherwise
- sentimentIndicators.vixRegime mapping:
    complacent: VIX < 13
    normal: 13 ≤ VIX < 20
    elevated: 20 ≤ VIX < 30
    extreme: VIX ≥ 30
    unknown: VIX status != "ok"
- decisionSummary.overallStance must be consistent with the dominant signals:
    risk-on: credit signal=risk-on AND vix=complacent|normal AND spy.pctVsSma200>0
    risk-off: credit signal=risk-off OR vix=extreme OR spy.pctVsSma200<-5
    barbell: positive trend + elevated VIX (>=20) OR widening credit
    defensive-tilt: spy.pctVsSma200<0 AND VIX>=20
    neutral: otherwise
- positioning.calls MUST each include a concrete invalidation trigger ("abandon overweight if HY OAS > 5.5%", "trim duration if US10Y > 4.6%").
- outlookInvalidationTriggers must be concrete thresholds, not vague language.
- evidenceQualityScore reflects how complete the packet was. If 4+ fields are unavailable, score ≤ 65. If SPY is missing entirely, score ≤ 40.

OUTPUT: Return ONE strict JSON object matching this TypeScript interface exactly:
{
  "generatedAt": string,
  "decisionSummary": { "headline": string, "horizon": "3-month"|"6-month"|"tactical-2-week", "overallStance": "risk-on"|"risk-off"|"neutral"|"barbell"|"defensive-tilt", "confidence": "high"|"moderate"|"low", "topOverweights": string[], "topUnderweights": string[], "keyHedges": string[] },
  "opportunityScore": number,
  "evidenceQualityScore": number,
  "personalExposureFlag": "none"|"low"|"elevated"|"high",
  "confidenceStatement": string,
  "whatConfirms": string[],
  "whatInvalidates": string[],
  "mainRisk": string,
  "dashboard": [{ "metric": string, "latest": string, "asOf": string, "signal": "bullish"|"bearish"|"neutral"|"unavailable", "read": string }],
  "economicIndicators": { "available": boolean, "summary": string, "gdpGrowthRead": string, "unemploymentRead": string, "inflationRead": string, "consumerSpendingRead": string },
  "fedAnalysis": { "currentStance": "tightening"|"easing"|"hold"|"unknown", "fedFundsRatePct": number|null, "fedFundsDelta1mBps": number|null, "rateDecisionProbabilityRead": string, "qtImpactRead": string },
  "earningsOutlook": { "available": false, "note": string, "priceTrendProxy": string },
  "valuationAssessment": { "available": false, "note": string, "extensionProxy": string },
  "creditMarketSignals": { "hyOasPct": number|null, "hyOasDelta1mBps": number|null, "igOasAvailable": false, "read": string, "signal": "risk-on"|"risk-off"|"neutral" },
  "marketBreadth": { "constituentBreadthAvailable": false, "spyProxyAbove200dPct": number|null, "advanceDeclineRead": string, "proxyVerdict": "expanding"|"narrowing"|"thrust"|"deteriorating"|"unknown", "proxyNote": string },
  "sentimentIndicators": { "vix": number|null, "vixRegime": "complacent"|"normal"|"elevated"|"extreme"|"unknown", "putCallRatioAvailable": false, "aaiiSurveyAvailable": false, "cnnFearGreedAvailable": false, "note": string },
  "geopoliticalRisks": { "operatorSupplied": boolean, "summary": string, "flaggedFactors": string[] },
  "seasonalPatterns": { "monthOrPeriod": string, "historicalRead": string, "confidence": "high"|"moderate"|"low" },
  "positioning": { "rebalanceSummary": string, "calls": [{ "bucket": string, "stance": "overweight"|"neutral"|"underweight"|"hedge", "weightChange": string, "rationale": string, "invalidation": string }], "outlookInvalidationTriggers": string[] },
  "closingParagraph": string,
  "classification": "ADMIN_RESEARCH_NOTE_NOT_BROKER_EXECUTION",
  "disclaimer": string
}`;

export function buildMacroMemoUserPrompt(args: {
  serializedPacket: string;
  horizon: "3-month" | "6-month" | "tactical-2-week";
  riskTolerance: "conservative" | "moderate" | "aggressive";
  currentExposures: string;
  personalExposureFlag: "none" | "low" | "elevated" | "high";
  operatorNotes?: string;
}): string {
  const L: string[] = [];
  L.push(`HORIZON: ${args.horizon}`);
  L.push(`RISK_TOLERANCE: ${args.riskTolerance}`);
  L.push(`CURRENT_EXPOSURES: ${args.currentExposures || "not-supplied"}`);
  L.push(`PERSONAL_EXPOSURE_FLAG: ${args.personalExposureFlag}`);
  L.push("(operator-set; surface in confidenceStatement only — does NOT alter call.)");
  if (args.operatorNotes) {
    L.push("");
    L.push(`OPERATOR_NOTES (may contain geopolitical / portfolio concerns / sleepless-night questions):`);
    L.push(args.operatorNotes);
  }
  L.push("");
  L.push("MACRO_PACKET:");
  L.push(args.serializedPacket);
  L.push("");
  L.push("Produce the MSP macro outlook memo as the strict JSON object only. No surrounding prose.");
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

export type ValidateResult =
  | { ok: true; memo: MacroOutlookMemo }
  | { ok: false; reason: string };

export function validateMacroMemo(raw: unknown): ValidateResult {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "not_an_object" };
  const m = raw as MacroOutlookMemo;

  const stringified = JSON.stringify(m);
  for (const rx of FORBIDDEN) {
    if (rx.test(stringified)) return { ok: false, reason: `forbidden_phrase:${rx.source}` };
  }

  if (!m.decisionSummary?.headline) return { ok: false, reason: "missing_decisionSummary.headline" };
  if (!Array.isArray(m.dashboard)) return { ok: false, reason: "dashboard_not_array" };
  if (!Array.isArray(m.positioning?.calls)) return { ok: false, reason: "positioning.calls_not_array" };
  if (!Array.isArray(m.positioning?.outlookInvalidationTriggers))
    return { ok: false, reason: "outlookInvalidationTriggers_not_array" };

  // Each positioning call MUST have an invalidation trigger.
  for (const call of m.positioning.calls) {
    if (!call.invalidation || call.invalidation.trim().length < 8) {
      return { ok: false, reason: `positioning.call_missing_invalidation:${call.bucket}` };
    }
  }

  // Hard data-integrity assertions.
  if (m.earningsOutlook?.available !== false) return { ok: false, reason: "earningsOutlook.available_must_be_false" };
  if (m.valuationAssessment?.available !== false) return { ok: false, reason: "valuationAssessment.available_must_be_false" };
  if (m.marketBreadth?.constituentBreadthAvailable !== false)
    return { ok: false, reason: "marketBreadth.constituentBreadthAvailable_must_be_false" };
  if (m.creditMarketSignals?.igOasAvailable !== false)
    return { ok: false, reason: "creditMarketSignals.igOasAvailable_must_be_false" };
  if (m.sentimentIndicators?.putCallRatioAvailable !== false)
    return { ok: false, reason: "sentimentIndicators.putCallRatioAvailable_must_be_false" };
  if (m.sentimentIndicators?.aaiiSurveyAvailable !== false)
    return { ok: false, reason: "sentimentIndicators.aaiiSurveyAvailable_must_be_false" };
  if (m.sentimentIndicators?.cnnFearGreedAvailable !== false)
    return { ok: false, reason: "sentimentIndicators.cnnFearGreedAvailable_must_be_false" };

  if (m.classification !== "ADMIN_RESEARCH_NOTE_NOT_BROKER_EXECUTION")
    return { ok: false, reason: "classification_mismatch" };

  return { ok: true, memo: m };
}

export function deriveMacroEvidenceScore(args: {
  spyOk: boolean;
  okSeriesCount: number;
  totalSeries: number;
}): number {
  // Scale: SPY OK contributes up to 40; series completeness contributes up to 60.
  const spyComponent = args.spyOk ? 40 : 0;
  const seriesComponent = args.totalSeries > 0
    ? (args.okSeriesCount / args.totalSeries) * 60
    : 0;
  return Math.round(Math.max(0, Math.min(100, spyComponent + seriesComponent)));
}
