/**
 * MSP sector rotation memo schema + system prompt.
 *
 * Operator-grade admin output. Gives explicit overweight / underweight
 * calls + a model allocation in percentage points. The system never
 * routes orders.
 */

export interface SectorRankingRow {
  ticker: string;
  sector: string;
  classification: string;
  return1mPct: number | null;
  return3mPct: number | null;
  return6mPct: number | null;
  rs1mPct: number | null;
  rs3mPct: number | null;
  rs6mPct: number | null;
  rsCompositeScore: number | null;
  /** AI-assigned overall stance. */
  stance: "overweight" | "neutral" | "underweight";
  /** Short narrative (1-2 sentences). */
  rationale: string;
}

export interface SectorAllocationRow {
  ticker: string;             // ETF (e.g. "XLK")
  sector: string;
  allocationPct: number;      // 0..100
  /** "core" overweight | tactical tilt | benchmark | underweight cash sleeve. */
  role: "core-overweight" | "tactical-tilt" | "benchmark" | "underweight" | "hedge" | "cash";
  rationale: string;
}

export interface SectorRotationMemo {
  generatedAt: string;
  /** TOP-OF-PAGE call. */
  decisionSummary: {
    headline: string;                   // e.g. "Risk-on cyclical tilt; favour XLI + XLF, underweight XLU + XLP"
    cyclePhase: "expansion" | "peak" | "contraction" | "trough" | "transition";
    cycleConfidence: "high" | "moderate" | "low";
    riskRegime: "risk-on" | "risk-off" | "neutral" | "transition";
    fedDirection: "tightening" | "easing" | "hold" | "unknown";
    topOverweights: string[];           // ticker list
    topUnderweights: string[];
  };

  /** AI Output Standards. */
  opportunityScore: number;
  evidenceQualityScore: number;
  personalExposureFlag: "none" | "low" | "elevated" | "high";
  confidenceStatement: string;
  whatConfirms: string[];
  whatInvalidates: string[];
  mainRisk: string;

  /** Economic cycle narrative. */
  economicCycle: {
    positioning: string;                 // narrative
    leadingIndicatorsRead: string;       // qualitative — yields, breadth, etc.
    historicalAnalogue: string;          // optional reference cycle
  };

  /** Interest rate impact section. */
  rateImpact: {
    summary: string;
    beneficiaries: string[];             // tickers
    losers: string[];
    yieldCurveRead: string;              // qualitative
  };

  /** Earnings growth comparison — flagged as missing per AV limitation. */
  earningsGrowthComparison: {
    available: false;                    // hard false on AV free
    note: string;                        // why missing
    qualitativeRead: string;             // what we can infer from price action only
  };

  /** Valuation comparison — flagged as missing per AV limitation. */
  valuationComparison: {
    available: false;                    // hard false on AV free
    note: string;
    /** Best proxy from packet: relative price-vs-200dma extension. */
    priceExtensionProxy: Array<{ ticker: string; vsSma200Pct: number | null; signal: string }>;
  };

  /** Money flow — flagged as missing. */
  moneyFlow: {
    available: false;
    note: string;
    /** Best proxy: composite RS scoring. */
    rsBasedProxy: string;
  };

  /** Defensive vs offensive read. */
  defensiveOffensiveRead: {
    leadership: "growth" | "defensive" | "cyclical" | "mixed" | "unknown";
    breadthRead: string;                 // % above 200dma context
    verdict: "lean-offensive" | "lean-defensive" | "barbell" | "neutral";
  };

  /** Per-sector ranking with stance and rationale. */
  sectorRankings: SectorRankingRow[];

  /** Top ETF picks for overweight sectors. */
  etfPicks: Array<{
    sector: string;
    ticker: string;                       // ETF symbol
    expenseRatioPct: number;
    rationale: string;
  }>;

  /** Model allocation — must sum to 100. */
  modelAllocation: {
    totalCheckPct: number;                // for AI to assert sum=100
    rows: SectorAllocationRow[];
    rebalanceNotes: string;
  };

  /** Implementation playbook. */
  implementationPlan: {
    sequencing: string;                   // "build cyclical tilt first, trim defensives second"
    triggers: string[];                   // what to watch
    invalidationLevels: string[];         // when to abandon the rotation
  };

  closingParagraph: string;

  classification: "ADMIN_RESEARCH_NOTE_NOT_BROKER_EXECUTION";
  disclaimer: string;
}

export const SECTOR_MEMO_DISCLAIMER =
  "Operator-grade MSP sector rotation memo for private desktop. Forward sector earnings growth, sector forward P/E, and institutional fund flows are NOT in the source packet (Alpha Vantage limitation) and are explicitly marked missing. The system does not place, route, or auto-execute any orders — all allocation decisions remain operator-driven. Levels and ETF references are analytical only.";

export const SECTOR_MEMO_SYSTEM_PROMPT = `You are a senior macro strategist managing sector rotation strategies. You are writing a private internal MSP memo for the desk's principal portfolio manager. Speak directly. Give explicit overweight / underweight calls and a model allocation that sums to 100%.

HARD RULES:
- The system does NOT place, route, or auto-execute any orders. NEVER claim an order was placed, filled, routed, or executed by the system. Phrases like "order has been placed", "trade has been executed", "auto-execute", "broker integration", "I have placed" are FORBIDDEN.
- You MAY (and should) give direct operator-grade allocation calls: "overweight XLK to 22%", "trim XLU to 4% underweight", "rotate 5pp from XLP into XLI". These are recommendations to the operator, not system actions.
- Use ONLY the SECTOR_PACKET. Do NOT invent numbers. If a value is "n/a" in the packet, write the same and lower confidence.
- Forward sector earnings growth and sector forward P/E are NOT in the AV free tier. Set earningsGrowthComparison.available = false and valuationComparison.available = false. Use price-vs-200dma extension as the only valuation proxy. NEVER fabricate sector P/E or growth numbers.
- Institutional fund flows are NEVER in the packet. Set moneyFlow.available = false. Use the composite RS score as the only inference path.
- Sector stance must be consistent with the data:
    overweight: rsCompositeScore ≥ 60 AND priceVsSma50Pct > 0 AND positive 3m or 6m RS
    underweight: rsCompositeScore ≤ 40 OR priceVsSma200Pct < 0 with negative momentum
    neutral: otherwise
- modelAllocation MUST sum to exactly 100% (assert via totalCheckPct = 100). Use whole-number or one-decimal weights. Include a cash sleeve only if the regime is risk-off OR breadth is < 40% above 200dma.
- cyclePhase must be consistent with breadth + macro:
    expansion: breadth >55% above 200dma + cyclicals leading + Fed easing or holding
    peak: breadth >70% AND defensives starting to outperform 1m
    contraction: breadth <40% above 200dma + defensives leading
    trough: breadth <30% AND cyclicals starting to outperform 1m
    transition: between phases / mixed leadership
- riskRegime "risk-on" requires breadth >50% above 200dma AND leadership in (cyclical, growth).
- fedDirection inferred from FED_FUNDS delta: tightening if deltaBps > +5 over 1m, easing if deltaBps < -5, hold otherwise. If macro packet status != "ok", use "unknown".
- etfPicks must use the exact tickers from the packet (XLK/XLV/XLF/XLY/XLC/XLI/XLP/XLE/XLU/XLRE/XLB) with the expenseRatioPct as listed. Do NOT recommend unlisted ETFs.
- Implementation triggers and invalidationLevels must be concrete (e.g. "abandon cyclical tilt if breadth drops below 35% above 200dma" or "add to XLF if 10Y > 4.50%").

OUTPUT: Return ONE strict JSON object matching this TypeScript interface exactly:
{
  "generatedAt": string,
  "decisionSummary": { "headline": string, "cyclePhase": "expansion"|"peak"|"contraction"|"trough"|"transition", "cycleConfidence": "high"|"moderate"|"low", "riskRegime": "risk-on"|"risk-off"|"neutral"|"transition", "fedDirection": "tightening"|"easing"|"hold"|"unknown", "topOverweights": string[], "topUnderweights": string[] },
  "opportunityScore": number,
  "evidenceQualityScore": number,
  "personalExposureFlag": "none"|"low"|"elevated"|"high",
  "confidenceStatement": string,
  "whatConfirms": string[],
  "whatInvalidates": string[],
  "mainRisk": string,
  "economicCycle": { "positioning": string, "leadingIndicatorsRead": string, "historicalAnalogue": string },
  "rateImpact": { "summary": string, "beneficiaries": string[], "losers": string[], "yieldCurveRead": string },
  "earningsGrowthComparison": { "available": false, "note": string, "qualitativeRead": string },
  "valuationComparison": { "available": false, "note": string, "priceExtensionProxy": [{ "ticker": string, "vsSma200Pct": number|null, "signal": string }] },
  "moneyFlow": { "available": false, "note": string, "rsBasedProxy": string },
  "defensiveOffensiveRead": { "leadership": "growth"|"defensive"|"cyclical"|"mixed"|"unknown", "breadthRead": string, "verdict": "lean-offensive"|"lean-defensive"|"barbell"|"neutral" },
  "sectorRankings": [{ "ticker": string, "sector": string, "classification": string, "return1mPct": number|null, "return3mPct": number|null, "return6mPct": number|null, "rs1mPct": number|null, "rs3mPct": number|null, "rs6mPct": number|null, "rsCompositeScore": number|null, "stance": "overweight"|"neutral"|"underweight", "rationale": string }],
  "etfPicks": [{ "sector": string, "ticker": string, "expenseRatioPct": number, "rationale": string }],
  "modelAllocation": { "totalCheckPct": number, "rows": [{ "ticker": string, "sector": string, "allocationPct": number, "role": "core-overweight"|"tactical-tilt"|"benchmark"|"underweight"|"hedge"|"cash", "rationale": string }], "rebalanceNotes": string },
  "implementationPlan": { "sequencing": string, "triggers": string[], "invalidationLevels": string[] },
  "closingParagraph": string,
  "classification": "ADMIN_RESEARCH_NOTE_NOT_BROKER_EXECUTION",
  "disclaimer": string
}`;

export function buildSectorMemoUserPrompt(args: {
  serializedPacket: string;
  riskTolerance: "conservative" | "moderate" | "aggressive";
  timeHorizon: string;
  currentExposures: string;
  personalExposureFlag: "none" | "low" | "elevated" | "high";
  operatorNotes?: string;
}): string {
  const L: string[] = [];
  L.push(`RISK_TOLERANCE: ${args.riskTolerance}`);
  L.push(`TIME_HORIZON: ${args.timeHorizon || "not-supplied"}`);
  L.push(`CURRENT_EXPOSURES: ${args.currentExposures || "not-supplied"}`);
  L.push(`PERSONAL_EXPOSURE_FLAG: ${args.personalExposureFlag}`);
  L.push("(operator-set; surface in confidenceStatement only — does NOT alter call.)");
  if (args.operatorNotes) {
    L.push("");
    L.push(`OPERATOR_NOTES: ${args.operatorNotes}`);
  }
  L.push("");
  L.push("SECTOR_PACKET:");
  L.push(args.serializedPacket);
  L.push("");
  L.push("Produce the MSP sector rotation memo as the strict JSON object only. No surrounding prose.");
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

export function validateSectorMemo(
  raw: unknown,
): { ok: true; memo: SectorRotationMemo } | { ok: false; reason: string } {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "non-object response" };
  const r = raw as Record<string, unknown>;
  const required = [
    "decisionSummary", "opportunityScore", "evidenceQualityScore",
    "personalExposureFlag", "confidenceStatement", "whatConfirms",
    "whatInvalidates", "mainRisk", "economicCycle", "rateImpact",
    "earningsGrowthComparison", "valuationComparison", "moneyFlow",
    "defensiveOffensiveRead", "sectorRankings", "etfPicks",
    "modelAllocation", "implementationPlan", "closingParagraph",
  ];
  for (const k of required) {
    if (!(k in r)) return { ok: false, reason: `missing field: ${k}` };
  }
  const flat = JSON.stringify(r);
  for (const re of FORBIDDEN) {
    if (re.test(flat)) return { ok: false, reason: `forbidden execution phrase: ${re}` };
  }
  // Force-correct hard rules.
  const eg = r.earningsGrowthComparison as Record<string, unknown> | undefined;
  if (eg) eg.available = false;
  const val = r.valuationComparison as Record<string, unknown> | undefined;
  if (val) val.available = false;
  const mf = r.moneyFlow as Record<string, unknown> | undefined;
  if (mf) mf.available = false;
  // Validate model allocation sums to ~100.
  const alloc = r.modelAllocation as Record<string, unknown> | undefined;
  if (alloc && Array.isArray(alloc.rows)) {
    const sum = (alloc.rows as Array<Record<string, unknown>>)
      .reduce((s, row) => s + (Number(row.allocationPct) || 0), 0);
    alloc.totalCheckPct = Math.round(sum * 100) / 100;
    if (Math.abs(sum - 100) > 1.0) {
      return { ok: false, reason: `modelAllocation sums to ${sum.toFixed(2)} (must be 100±1)` };
    }
  }
  r.classification = "ADMIN_RESEARCH_NOTE_NOT_BROKER_EXECUTION";
  r.disclaimer = SECTOR_MEMO_DISCLAIMER;
  if (!r.generatedAt) r.generatedAt = new Date().toISOString();
  return { ok: true, memo: r as unknown as SectorRotationMemo };
}

export function deriveSectorEvidenceScore(args: {
  sectorsOk: number;          // 0..11
  benchmarkOk: boolean;
  treasuryOk: boolean;
  fedFundsOk: boolean;
}): number {
  let score = 0;
  // Sectors: 60 pts max (5.45 per sector to 11).
  score += (args.sectorsOk / 11) * 60;
  // Benchmark: 20 pts.
  if (args.benchmarkOk) score += 20;
  // Macro: 20 pts (10 each).
  if (args.treasuryOk) score += 10;
  if (args.fedFundsOk) score += 10;
  return Math.round(Math.max(0, Math.min(100, score)));
}
