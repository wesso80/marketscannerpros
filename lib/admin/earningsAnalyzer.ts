/**
 * JPMorgan-style earnings analyzer schema + system prompt.
 *
 * Operator-grade admin output. Speaks directly to the principal with
 * a decision summary and trade plan at the top. The system never
 * routes orders — operator decides.
 */

export interface EarningsHistoryRow {
  reportedDate: string | null;
  estimatedEPS: number | null;
  reportedEPS: number | null;
  surprisePct: number | null;
  beat: "beat" | "miss" | "in-line" | "unknown";
  reactionPct: number | null;
  reactionDirection: "gap-up" | "gap-down" | "flat" | "unknown";
  /** AI-written 1-line context (e.g. "guide cut overshadowed beat"). */
  context: string;
}

export interface KeyMetricToWatch {
  /** Specific number / KPI (e.g. "Data center revenue ≥ $26B"). */
  metric: string;
  /** What hitting it means (bullish/bearish/neutral and how big the move). */
  significance: string;
  /** Quantitative threshold or qualitative trigger. */
  threshold: string;
}

export interface SegmentExpectation {
  segment: string;            // e.g. "iPhone", "Services", "Cloud"
  /** Approx revenue or growth estimate (analyst-derived if available, else
   *  qualitative trend from packet's revenue history). */
  estimate: string;
  growthCommentary: string;
  /** Mark "wall-street-consensus" if not derivable from packet. */
  source: "computed-from-packet" | "qualitative" | "missing-no-segment-data";
}

export interface PostEarningsScenario {
  scenario: "gap-up" | "gap-down" | "flat-open";
  trigger: string;            // what triggers this scenario
  playbook: string;           // operator-grade trade plan
  invalidation: string;       // when to abandon the playbook
  positionSizingNote: string; // qualitative
}

export interface EarningsAnalyzerNote {
  generatedAt: string;
  ticker: string;
  /** Earnings date (operator-supplied or extracted from AV). */
  earningsDate: string | null;
  /** "pre-earnings" or "post-earnings" framing — operator-supplied. */
  framing: "pre-earnings" | "post-earnings";

  /** TOP-OF-PAGE decision summary + trade plan (JPM-style). */
  decisionSummary: {
    /** One-line headline call. */
    headline: string;
    /** Operator-grade pre-earnings stance. */
    preEarningsStance: "buy-before" | "trim-before" | "wait-for-reaction" | "no-action" | "hedge-existing";
    /** Single most likely outcome (with confidence band). */
    expectedOutcome: string;
    /** Implied move estimate based on packet history (NOT options-IV). */
    historicalImpliedMovePct: number | null;
    /** Top 3 trade triggers in priority order. */
    topTriggers: string[];
  };

  /** Required AI Output Standards. */
  opportunityScore: number;       // 0..100
  evidenceQualityScore: number;   // 0..100
  personalExposureFlag: "none" | "low" | "elevated" | "high";
  confidenceStatement: string;
  whatConfirms: string[];
  whatInvalidates: string[];
  mainRisk: string;

  /** Earnings history block — last 6 quarters with context. */
  earningsHistory: EarningsHistoryRow[];

  /** Wall Street consensus for the upcoming quarter.
   *  When unavailable, mark explicitly as missing rather than fabricating. */
  consensus: {
    nextQuarterRevenueEstimate: string;   // e.g. "$94.5B" or "missing-no-AV-source"
    nextQuarterEPSEstimate: string;       // e.g. "$1.42" or "missing-no-AV-source"
    consensusSource: "missing-no-AV-source" | "operator-supplied" | "derived-from-trend";
    yoyRevenueGrowthExpectedPct: number | null;
    yoyEPSGrowthExpectedPct: number | null;
    /** Whisper number narrative — explicitly note this is not in packet. */
    whisperNumberNote: string;
  };

  /** 3-5 specific numbers to watch. */
  keyMetricsToWatch: KeyMetricToWatch[];

  /** Segment-level revenue expectations. */
  segmentExpectations: SegmentExpectation[];

  /** Management guidance — what they promised + likelihood of delivery. */
  managementGuidance: {
    lastQuarterGuidance: string;
    deliveryLikelihood: "high" | "moderate" | "low" | "unknown";
    rationale: string;
    /** Forward guidance to listen for on the call. */
    keyForwardGuidanceItems: string[];
  };

  /** Options implied move — real ATM straddle when AV options endpoint
   *  returns data, otherwise flagged as unavailable with a historical proxy. */
  optionsImpliedMove: {
    available: boolean;
    /** Live ATM-straddle implied move % when available, else null. */
    impliedMovePct: number | null;
    /** Expiry used for the straddle (YYYY-MM-DD) when available. */
    expiry: string | null;
    /** Source string (AV endpoint) or "unavailable". */
    source: string;
    note: string;                 // explain availability / proxy
    /** Best proxy from packet: avg/median earnings-day move. */
    historicalProxyAvgPct: number | null;
    historicalProxyMedianPct: number | null;
  };

  /** Historical earnings-day pattern summary. */
  historicalPattern: {
    sampleSize: number;
    avgAbsMovePct: number | null;
    medianAbsMovePct: number | null;
    avgReactionOnBeatPct: number | null;
    avgReactionOnMissPct: number | null;
    /** Narrative: tendency to gap-up/down, fade, follow-through. */
    pattern: string;
  };

  /** Pre-earnings positioning recommendation. */
  preEarningsPositioning: {
    recommendation: "buy-before" | "trim-before" | "wait-for-reaction" | "no-action" | "hedge-existing";
    rationale: string;
    /** Operator-grade structure (e.g. "long via call spread to define risk"). */
    structure: string;
    sizing: string;               // qualitative sizing band
    riskLevel: "low" | "moderate" | "high" | "extreme";
  };

  /** Post-earnings playbook — three scenarios. */
  postEarningsPlaybook: PostEarningsScenario[];

  /** Closing JPM-style paragraph. */
  closingParagraph: string;

  classification: "ADMIN_RESEARCH_NOTE_NOT_BROKER_EXECUTION";
  disclaimer: string;
}

export const EARNINGS_NOTE_DISCLAIMER =
  "Operator-grade JPMorgan-style earnings analysis for private desktop. Consensus + whisper + options implied move are NOT in the source packet (Alpha Vantage limitation) and are explicitly marked missing. The system does not place, route, or auto-execute any orders — all trade plans remain operator-driven. Levels and structures are analytical references.";

export const EARNINGS_NOTE_SYSTEM_PROMPT = `You are a senior equity research analyst at JPMorgan Chase with 20 years of experience writing pre- and post-earnings notes for the firm's institutional trading clients managing billions in assets. You speak directly to the principal portfolio manager. You give clear trade plans.

HARD RULES:
- The system does NOT place, route, or auto-execute any orders. NEVER claim an order was placed, filled, routed, or executed by the system. Phrases like "order has been placed", "trade has been executed", "auto-execute", "broker integration", "I have placed" are FORBIDDEN.
- You MAY (and should) give direct operator-grade trade plans: "long via Mar 200/220 call spread", "buy-write covered call into print", "wait for IV crush before adding". These are recommendations to the operator.
- Use ONLY the EARNINGS_PACKET. Do NOT invent numbers. Where the packet says "n/a" or "missing-no-AV-source", write the same in the output and lower confidence — do NOT fabricate consensus, whisper, or options-implied-move values.
- Wall Street consensus for the upcoming quarter is NOT in the AV free tier. If operator did not supply consensus values in OPERATOR_NOTES, mark consensusSource as "missing-no-AV-source" and write "n/a (consensus not in packet)" for the estimate fields. You may derive a "derived-from-trend" estimate from the packet's recent revenue/EPS trajectory — clearly label it as such and lower evidenceQualityScore.
- Whisper number is NEVER in the packet. Always note this explicitly in whisperNumberNote.
- Options implied move: PREFER the live ATM straddle from OPTIONS_IV in the packet when 'available: true'. In that case set optionsImpliedMove.available = true, impliedMovePct = OPTIONS_IV.implied_move_pct, expiry = OPTIONS_IV.expiry, source = OPTIONS_IV.source, and write a note that cites the expiry + DTE. If OPTIONS_IV.available is false, set optionsImpliedMove.available = false, leave impliedMovePct/expiry null, source = "unavailable", and fall back to the historical avg/median earnings-day move from REACTION_STATS as the proxy — be explicit that this is a backward-looking proxy, not a forward IV signal.
- Segment expectations: if packet has no segment-level data (it doesn't — INCOME_STATEMENT is consolidated), set source = "missing-no-segment-data" for segments and provide qualitative commentary based on company description (sector/industry) only. Do not fabricate segment revenue numbers.
- historicalImpliedMovePct must equal REACTION_STATS.median_abs_move_pct (or avg_abs_move_pct if median missing). Do not invent a separate IV-based number.
- earningsHistory rows must mirror EARNINGS_HISTORY in the packet exactly (same dates, EPS values, reactions). You only add the 'context' commentary field.
- Pre-earnings stance must match risk/reward: if EARNINGS_PACKET shows mostly beats with positive reactions, "buy-before" is permissible WITH a defined-risk structure (e.g. call spread). If history is mixed or shows large negative reactions on misses, prefer "wait-for-reaction" or "hedge-existing".
- Each post-earnings scenario must have a concrete trigger (e.g. "gap up >5% on raised guidance") and an invalidation level.
- evidenceQualityScore reflects packet completeness: full earnings history + revenue + overview + daily series = 80-90; missing earnings or daily series = 30-50; rate-limited = 20-40.

OUTPUT: Return ONE strict JSON object matching this TypeScript interface exactly:
{
  "generatedAt": string (ISO),
  "ticker": string,
  "earningsDate": string|null,
  "framing": "pre-earnings"|"post-earnings",
  "decisionSummary": { "headline": string, "preEarningsStance": "buy-before"|"trim-before"|"wait-for-reaction"|"no-action"|"hedge-existing", "expectedOutcome": string, "historicalImpliedMovePct": number|null, "topTriggers": string[] },
  "opportunityScore": number,
  "evidenceQualityScore": number,
  "personalExposureFlag": "none"|"low"|"elevated"|"high",
  "confidenceStatement": string,
  "whatConfirms": string[],
  "whatInvalidates": string[],
  "mainRisk": string,
  "earningsHistory": [{ "reportedDate": string|null, "estimatedEPS": number|null, "reportedEPS": number|null, "surprisePct": number|null, "beat": "beat"|"miss"|"in-line"|"unknown", "reactionPct": number|null, "reactionDirection": "gap-up"|"gap-down"|"flat"|"unknown", "context": string }],
  "consensus": { "nextQuarterRevenueEstimate": string, "nextQuarterEPSEstimate": string, "consensusSource": "missing-no-AV-source"|"operator-supplied"|"derived-from-trend", "yoyRevenueGrowthExpectedPct": number|null, "yoyEPSGrowthExpectedPct": number|null, "whisperNumberNote": string },
  "keyMetricsToWatch": [{ "metric": string, "significance": string, "threshold": string }],
  "segmentExpectations": [{ "segment": string, "estimate": string, "growthCommentary": string, "source": "computed-from-packet"|"qualitative"|"missing-no-segment-data" }],
  "managementGuidance": { "lastQuarterGuidance": string, "deliveryLikelihood": "high"|"moderate"|"low"|"unknown", "rationale": string, "keyForwardGuidanceItems": string[] },
  "optionsImpliedMove": { "available": boolean, "impliedMovePct": number|null, "expiry": string|null, "source": string, "note": string, "historicalProxyAvgPct": number|null, "historicalProxyMedianPct": number|null },
  "historicalPattern": { "sampleSize": number, "avgAbsMovePct": number|null, "medianAbsMovePct": number|null, "avgReactionOnBeatPct": number|null, "avgReactionOnMissPct": number|null, "pattern": string },
  "preEarningsPositioning": { "recommendation": "buy-before"|"trim-before"|"wait-for-reaction"|"no-action"|"hedge-existing", "rationale": string, "structure": string, "sizing": string, "riskLevel": "low"|"moderate"|"high"|"extreme" },
  "postEarningsPlaybook": [{ "scenario": "gap-up"|"gap-down"|"flat-open", "trigger": string, "playbook": string, "invalidation": string, "positionSizingNote": string }],
  "closingParagraph": string,
  "classification": "ADMIN_RESEARCH_NOTE_NOT_BROKER_EXECUTION",
  "disclaimer": string
}`;

export function buildEarningsNoteUserPrompt(args: {
  serializedPacket: string;
  framing: "pre-earnings" | "post-earnings";
  earningsDateOperator: string | null;
  personalExposureFlag: "none" | "low" | "elevated" | "high";
  operatorNotes?: string;
}): string {
  const L: string[] = [];
  L.push(`FRAMING: ${args.framing}`);
  L.push(`EARNINGS_DATE_OPERATOR: ${args.earningsDateOperator ?? "not-supplied"}`);
  L.push(`PERSONAL_EXPOSURE_FLAG: ${args.personalExposureFlag}`);
  L.push("(operator-set; surface in confidenceStatement only — does NOT alter call.)");
  if (args.operatorNotes) {
    L.push("");
    L.push(`OPERATOR_NOTES: ${args.operatorNotes}`);
  }
  L.push("");
  L.push("EARNINGS_PACKET:");
  L.push(args.serializedPacket);
  L.push("");
  L.push("Produce the JPMorgan-style earnings note as the strict JSON object only. No surrounding prose.");
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

export function validateEarningsNote(
  raw: unknown,
): { ok: true; note: EarningsAnalyzerNote } | { ok: false; reason: string } {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "non-object response" };
  const r = raw as Record<string, unknown>;
  const required = [
    "ticker", "framing", "decisionSummary", "opportunityScore", "evidenceQualityScore",
    "personalExposureFlag", "confidenceStatement", "whatConfirms", "whatInvalidates",
    "mainRisk", "earningsHistory", "consensus", "keyMetricsToWatch",
    "segmentExpectations", "managementGuidance", "optionsImpliedMove",
    "historicalPattern", "preEarningsPositioning", "postEarningsPlaybook",
    "closingParagraph",
  ];
  for (const k of required) {
    if (!(k in r)) return { ok: false, reason: `missing field: ${k}` };
  }
  const flat = JSON.stringify(r);
  for (const re of FORBIDDEN) {
    if (re.test(flat)) return { ok: false, reason: `forbidden execution phrase: ${re}` };
  }
  // optionsImpliedMove: backfill defaults so UI never crashes.
  const opt = r.optionsImpliedMove as Record<string, unknown> | undefined;
  if (opt) {
    if (typeof opt.available !== "boolean") opt.available = false;
    if (!("impliedMovePct" in opt)) opt.impliedMovePct = null;
    if (!("expiry" in opt)) opt.expiry = null;
    if (typeof opt.source !== "string") opt.source = opt.available ? "alpha-vantage" : "unavailable";
    if (typeof opt.note !== "string") opt.note = "";
    if (!("historicalProxyAvgPct" in opt)) opt.historicalProxyAvgPct = null;
    if (!("historicalProxyMedianPct" in opt)) opt.historicalProxyMedianPct = null;
  }
  r.classification = "ADMIN_RESEARCH_NOTE_NOT_BROKER_EXECUTION";
  r.disclaimer = EARNINGS_NOTE_DISCLAIMER;
  if (!r.generatedAt) r.generatedAt = new Date().toISOString();
  return { ok: true, note: r as unknown as EarningsAnalyzerNote };
}

export function deriveEarningsEvidenceScore(args: {
  earningsRowsCount: number;
  revenueRowsCount: number;
  overviewOk: boolean;
  dailyOk: boolean;
  reactionSampleSize: number;
}): number {
  let score = 0;
  // Earnings history: 30 pts max (5 pts per quarter to 6).
  score += Math.min(args.earningsRowsCount, 6) * 5;
  // Revenue history: 20 pts (2.5 per quarter to 8).
  score += Math.min(args.revenueRowsCount, 8) * 2.5;
  // Overview: 10 pts.
  if (args.overviewOk) score += 10;
  // Daily series: 20 pts.
  if (args.dailyOk) score += 20;
  // Reaction sample size: 10 pts (1.67 per sample to 6).
  score += Math.min(args.reactionSampleSize, 6) * (10 / 6);
  return Math.round(Math.max(0, Math.min(100, score)));
}
