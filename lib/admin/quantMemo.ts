/**
 * MSP quant screener memo schema + system prompt.
 *
 * Operator-grade quant report:
 *   - Top 10 ranked by composite score with factor breakdown
 *   - Sector distribution check (no accidental concentration)
 *   - Watch list: next 10 + what would push them in
 *   - Historical backtest context (qualitative only — we don't run a true
 *     point-in-time multi-factor backtest server-side)
 *
 * Hard-locked unavailable per data integrity:
 *   - Sentiment factor (insider/13F/short interest/revisions)
 *   - True point-in-time historical performance vs S&P 500
 */

import type { QuantScreenSnapshot } from "./quantScreener";

export interface QuantTopPick {
  rank: number;                           // 1..10
  ticker: string;
  name: string | null;
  sector: string | null;
  marketCapBucket: "mega" | "large" | "mid" | "small" | "micro" | "unknown";
  /** Composite score 0-100, must match snapshot value. */
  compositeScore: number;
  /** Per-factor breakdown — values must match snapshot. */
  factorBreakdown: {
    value: number | null;
    quality: number | null;
    momentum: number | null;
    growth: number | null;
    sentiment: null;                      // hard null
  };
  /** Why this stock made the cut. */
  thesisOneLiner: string;
  /** Strongest factor + supporting metric. */
  primaryEdge: string;
  /** Weakest factor / risk to the call. */
  primaryConcern: string;
  /** What price-action / fundamental event invalidates the pick. */
  invalidationLevel: string;
}

export interface SectorDistributionRow {
  sector: string;
  countInTop10: number;
  pctOfTop10: number;
  /** "balanced" | "concentrated" | "diversified" */
  flag: "balanced" | "concentrated" | "diversified";
}

export interface QuantWatchRow {
  ticker: string;
  name: string | null;
  sector: string | null;
  compositeScore: number | null;
  /** Specific factor scores blocking promotion. */
  blockingFactor: string;
  /** Concrete improvement that would push it into the top 10. */
  trigger: string;
}

export interface QuantScreenerReport {
  generatedAt: string;

  /** Decision summary header strip. */
  decisionSummary: {
    headline: string;
    topPickTicker: string;
    sectorTilt: string;                   // "tilted toward Industrials + Financials"
    breadthRead: string;                  // "12 of 25 ok ROE>15% and momentum>50"
    confidenceCall: "high" | "moderate" | "low";
  };

  /** AI Output Standards. */
  opportunityScore: number;
  evidenceQualityScore: number;
  personalExposureFlag: "none" | "low" | "elevated" | "high";
  confidenceStatement: string;
  whatConfirms: string[];
  whatInvalidates: string[];
  mainRisk: string;

  /** Universe summary — must mirror snapshot.universeStats. */
  universeRecap: {
    universeSize: number;
    okCount: number;
    failedCount: number;
    medianPE: number | null;
    medianEVToEBITDA: number | null;
    medianROE: number | null;
    medianRevGrowth: number | null;
  };

  /** Top 10 highest composite scores. */
  topPicks: QuantTopPick[];

  /** Sector breakdown of the top 10. */
  sectorDistribution: SectorDistributionRow[];
  /** Concentration verdict + recommended rebalance, if any. */
  concentrationVerdict: string;

  /** Watch list: next 10. */
  watchList: QuantWatchRow[];

  /** Backtest context — explicitly flagged as qualitative. */
  backtestContext: {
    available: false;                     // hard false — no PIT engine here
    qualitativeRead: string;              // what we know from published factor literature
    factorRegimeNote: string;             // "value + quality has historically outperformed in rising-rate phases"
  };

  /** Sentiment factor — hard locked as unavailable. */
  sentimentFactorStatus: {
    available: false;
    note: string;                         // why: AV free tier limitations
    missingComponents: string[];          // insider / 13F / short interest / revisions
  };

  /** Implementation guidance. */
  implementationNotes: {
    sequencing: string;                   // "scale into top 3 first"
    sizingFramework: string;              // "equal-weight top 10 = 10% each, or score-weighted"
    rebalanceCadence: string;             // "monthly factor refresh"
    capacityCaveat: string;               // "small-cap names may have wider spreads"
  };

  closingParagraph: string;

  classification: "ADMIN_RESEARCH_NOTE_NOT_BROKER_EXECUTION";
  disclaimer: string;
}

export const QUANT_MEMO_DISCLAIMER =
  "Operator-grade MSP multi-factor quant screen for private admin desk. Sentiment-factor inputs (insider buying, 13F flow, short interest, sell-side revisions) are NOT in the source packet (Alpha Vantage free tier) and are hard-flagged unavailable. Composite scores use only the available factor inputs (value / quality / momentum / growth). No point-in-time historical backtest is run server-side; the backtest context is qualitative only. The system does not place, route, or auto-execute any orders.";

export const QUANT_MEMO_SYSTEM_PROMPT = `You are a senior quantitative researcher writing a private internal MSP screen report for the desk's principal portfolio manager. Speak directly. Give the top 10 ranked stocks with a factor breakdown.

HARD RULES:
- The system does NOT place, route, or auto-execute any orders. NEVER claim an order was placed, filled, routed, or executed by the system. Phrases like "order has been placed", "trade has been executed", "auto-execute", "broker integration", "I have placed" are FORBIDDEN.
- You MAY (and should) give direct operator-grade picks: "long XYZ at $42 with stop $38", "equal-weight top 10 at 10% each", "skip ABC until ROE recovers above 15%". These are recommendations to the operator, not system actions.
- Use ONLY the SCREEN_PACKET. Do NOT invent numbers. The factor scores in topPicks MUST match the snapshot values exactly. The composite ranking MUST match the snapshot's rankedTickers order for the top 10.
- Sentiment factor is unavailable (insider / 13F / short interest / revisions are NOT in the AV free tier). Set sentimentFactorStatus.available = false. Do NOT claim a sentiment score. Do NOT fabricate insider activity. Do NOT cite analyst revision counts.
- No true point-in-time backtest is run server-side. Set backtestContext.available = false. You may give a QUALITATIVE read citing published factor literature (Fama-French value + quality + momentum behaviour across regimes), but do NOT cite specific historical CAGR or Sharpe numbers as if you ran them. Use ranges and regime-conditional language.
- topPicks must contain exactly the top 10 tickers from snapshot.rankedTickers that have non-null composite scores. If fewer than 10 have valid composite scores, return as many as exist and note the gap in confidenceStatement.
- watchList must contain the next 10 (ranks 11..20). For each, blockingFactor must reference the actual weakest factor in the snapshot, and trigger must be concrete and data-driven (e.g. "ROE rising from 12% to >15%" or "price reclaim of 200dma at $52").
- sectorDistribution rows must cover every sector represented in topPicks. Flag any sector with ≥40% of top 10 as "concentrated".
- marketCapBucket mapping: mega ≥$200B, large $10B-$200B, mid $2B-$10B, small $300M-$2B, micro <$300M, unknown if missing.
- invalidationLevel must be concrete: a price level, an indicator threshold, OR a fundamental trigger (not vague language).
- Do not recommend stocks NOT in the universe.

OUTPUT: Return ONE strict JSON object matching this TypeScript interface exactly:
{
  "generatedAt": string,
  "decisionSummary": { "headline": string, "topPickTicker": string, "sectorTilt": string, "breadthRead": string, "confidenceCall": "high"|"moderate"|"low" },
  "opportunityScore": number,
  "evidenceQualityScore": number,
  "personalExposureFlag": "none"|"low"|"elevated"|"high",
  "confidenceStatement": string,
  "whatConfirms": string[],
  "whatInvalidates": string[],
  "mainRisk": string,
  "universeRecap": { "universeSize": number, "okCount": number, "failedCount": number, "medianPE": number|null, "medianEVToEBITDA": number|null, "medianROE": number|null, "medianRevGrowth": number|null },
  "topPicks": [{ "rank": number, "ticker": string, "name": string|null, "sector": string|null, "marketCapBucket": "mega"|"large"|"mid"|"small"|"micro"|"unknown", "compositeScore": number, "factorBreakdown": { "value": number|null, "quality": number|null, "momentum": number|null, "growth": number|null, "sentiment": null }, "thesisOneLiner": string, "primaryEdge": string, "primaryConcern": string, "invalidationLevel": string }],
  "sectorDistribution": [{ "sector": string, "countInTop10": number, "pctOfTop10": number, "flag": "balanced"|"concentrated"|"diversified" }],
  "concentrationVerdict": string,
  "watchList": [{ "ticker": string, "name": string|null, "sector": string|null, "compositeScore": number|null, "blockingFactor": string, "trigger": string }],
  "backtestContext": { "available": false, "qualitativeRead": string, "factorRegimeNote": string },
  "sentimentFactorStatus": { "available": false, "note": string, "missingComponents": string[] },
  "implementationNotes": { "sequencing": string, "sizingFramework": string, "rebalanceCadence": string, "capacityCaveat": string },
  "closingParagraph": string,
  "classification": "ADMIN_RESEARCH_NOTE_NOT_BROKER_EXECUTION",
  "disclaimer": string
}`;

export function buildQuantMemoUserPrompt(args: {
  serializedPacket: string;
  preferredSectors: string;
  marketCapRange: string;
  emphasisFactors: string;
  excludeFactors: string;
  personalExposureFlag: "none" | "low" | "elevated" | "high";
  operatorNotes: string;
}): string {
  const L: string[] = [];
  L.push(`PREFERRED_SECTORS: ${args.preferredSectors || "any"}`);
  L.push(`MARKET_CAP_RANGE: ${args.marketCapRange || "any"}`);
  L.push(`EMPHASIS_FACTORS: ${args.emphasisFactors || "balanced (equal weight value+quality+momentum+growth)"}`);
  L.push(`EXCLUDE_FACTORS: ${args.excludeFactors || "none"}`);
  L.push(`PERSONAL_EXPOSURE_FLAG: ${args.personalExposureFlag}`);
  L.push("(operator-set; surface in confidenceStatement only — does NOT alter the ranking.)");
  if (args.operatorNotes) {
    L.push("");
    L.push(`OPERATOR_NOTES: ${args.operatorNotes}`);
  }
  L.push("");
  L.push("SCREEN_PACKET:");
  L.push(args.serializedPacket);
  L.push("");
  L.push("Produce the MSP quant screening report as the strict JSON object only. No surrounding prose.");
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

export function validateQuantMemo(
  raw: unknown,
): { ok: true; memo: QuantScreenerReport } | { ok: false; reason: string } {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "non-object response" };
  const r = raw as Record<string, unknown>;
  const required = [
    "decisionSummary", "opportunityScore", "evidenceQualityScore",
    "personalExposureFlag", "confidenceStatement", "whatConfirms",
    "whatInvalidates", "mainRisk", "universeRecap", "topPicks",
    "sectorDistribution", "concentrationVerdict", "watchList",
    "backtestContext", "sentimentFactorStatus", "implementationNotes",
    "closingParagraph",
  ];
  for (const k of required) {
    if (!(k in r)) return { ok: false, reason: `missing field: ${k}` };
  }
  const flat = JSON.stringify(r);
  for (const re of FORBIDDEN) {
    if (re.test(flat)) return { ok: false, reason: `forbidden execution phrase: ${re}` };
  }
  // Force-correct unavailable flags.
  const bt = r.backtestContext as Record<string, unknown> | undefined;
  if (bt) bt.available = false;
  const sf = r.sentimentFactorStatus as Record<string, unknown> | undefined;
  if (sf) sf.available = false;
  // Force sentiment in all topPicks to null.
  const tp = r.topPicks;
  if (Array.isArray(tp)) {
    for (const pick of tp) {
      if (pick && typeof pick === "object") {
        const p = pick as Record<string, unknown>;
        const fb = p.factorBreakdown as Record<string, unknown> | undefined;
        if (fb) fb.sentiment = null;
      }
    }
    if (tp.length > 10) {
      (r as Record<string, unknown>).topPicks = tp.slice(0, 10);
    }
  }
  // Cap watchList at 10.
  const wl = r.watchList;
  if (Array.isArray(wl) && wl.length > 10) {
    (r as Record<string, unknown>).watchList = wl.slice(0, 10);
  }
  return { ok: true, memo: r as unknown as QuantScreenerReport };
}

export function deriveQuantEvidenceScore(snapshot: QuantScreenSnapshot): number {
  // 60 pts: % of universe with ok status.
  // 20 pts: benchmark SPY ok (needed for RS).
  // 10 pts: universe size >= 15 (statistical signal).
  // 10 pts: at least 3 of 4 universe medians available.
  let score = 0;
  const total = Math.max(snapshot.universe.length, 1);
  score += (snapshot.universeStats.okCount / total) * 60;
  if (snapshot.benchmark.status === "ok") score += 20;
  if (snapshot.universe.length >= 15) score += 10;
  const u = snapshot.universeStats;
  const medCount = [u.medianPE, u.medianEVToEBITDA, u.medianROE, u.medianRevGrowth]
    .filter((v) => v != null).length;
  if (medCount >= 3) score += 10;
  return Math.round(Math.min(score, 100));
}

/** Default screening universe: liquid US large-caps spanning sectors. */
export const DEFAULT_UNIVERSE = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA",        // mega-cap tech / discretionary
  "JPM", "BAC", "GS", "MS",                                       // financials
  "UNH", "JNJ", "LLY", "PFE",                                     // healthcare
  "XOM", "CVX",                                                   // energy
  "CAT", "GE", "HON",                                             // industrials
  "WMT", "PG", "KO",                                              // staples
  "NEE",                                                          // utilities
  "AMT",                                                          // REIT
];
