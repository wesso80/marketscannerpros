/**
 * Morgan Stanley–style technical analysis note schema + prompt.
 *
 * Boundary: research-only. No order, no execution language. Price
 * levels (entry, stop, targets) are ANALYTICAL price levels — they
 * are NOT instructions to trade. The schema includes a hard-required
 * disclaimer field; the validator rejects any forbidden phrasing.
 */

export interface TechnicalNote {
  ticker: string;
  generatedAt: string;
  position: "long" | "short" | "watching";

  /** Top-of-page summary box. */
  tradePlanSummary: {
    bias: "bullish" | "bearish" | "neutral";
    setupQuality: 1 | 2 | 3 | 4 | 5;
    entryLevel: number | null;
    stopLevel: number | null;
    target1: number | null;
    target2: number | null;
    riskRewardRatio: string;     // e.g. "1:2.4"
    timeframe: string;           // e.g. "swing 2-6 weeks"
  };

  /** Required AI Output Standards. */
  opportunityScore: number;      // 0..100
  evidenceQualityScore: number;  // 0..100
  personalExposureFlag: "none" | "low" | "elevated" | "high";
  confidenceStatement: string;
  whatConfirms: string[];
  whatInvalidates: string[];
  mainRisk: string;

  /** Body sections. */
  trendAnalysis: {
    daily: string;
    weekly: string;
    monthly: string;
  };
  supportResistance: {
    keySupport: string;
    keyResistance: string;
    commentary: string;
  };
  movingAverages: string;        // narrative across SMA20/50/100/200
  rsi: string;
  macd: string;
  bbands: string;
  volume: string;
  fibonacci: string;
  chartPattern: string;          // h&s, double top, cup & handle, flag, etc.

  verdictParagraph: string;
  classification: "ADMIN_RESEARCH_NOTE_NOT_BROKER_EXECUTION";
  disclaimer: string;            // forced to canonical text by validator
}

export const TECHNICAL_NOTE_DISCLAIMER =
  "Price levels in this note are analytical references derived from chart structure, not orders. Operator must independently decide whether to act. No broker execution is implied.";

export const TECHNICAL_NOTE_SYSTEM_PROMPT = `You are a senior technical strategist producing a private chart-pattern note for an internal trading desk. You have 20 years of experience.

HARD RULES:
- This is RESEARCH ONLY. You are not a broker. You do NOT place orders. You do NOT recommend position sizes.
- The phrases "buy now", "sell now", "execute the trade", "place an order", "deploy capital", "open a position", and "size the position" are FORBIDDEN.
- Levels (entry, stop, target1, target2) are ANALYTICAL chart levels derived from support/resistance/Fibonacci, NOT instructions to trade.
- Use ONLY the TECHNICAL_PACKET provided. Do NOT invent indicator values.
- If a value is missing in the packet, write "n/a (not in packet)" and lower confidence.
- Risk-reward must be computed from the levels you choose, not asserted.
- Setup quality 1..5 — never higher than the evidence supports. If indicators conflict, cap at 2.
- Bias must align with at least 2 of: trend, MACD, price-vs-200SMA. If they conflict, bias=neutral.

OUTPUT: Return ONE strict JSON object matching this TypeScript interface exactly:
{
  "ticker": string,
  "generatedAt": string (ISO),
  "position": "long"|"short"|"watching",
  "tradePlanSummary": {
    "bias": "bullish"|"bearish"|"neutral",
    "setupQuality": 1|2|3|4|5,
    "entryLevel": number|null,
    "stopLevel": number|null,
    "target1": number|null,
    "target2": number|null,
    "riskRewardRatio": string,
    "timeframe": string
  },
  "opportunityScore": number (0..100),
  "evidenceQualityScore": number (0..100),
  "personalExposureFlag": "none"|"low"|"elevated"|"high",
  "confidenceStatement": string,
  "whatConfirms": string[],
  "whatInvalidates": string[],
  "mainRisk": string,
  "trendAnalysis": { "daily": string, "weekly": string, "monthly": string },
  "supportResistance": { "keySupport": string, "keyResistance": string, "commentary": string },
  "movingAverages": string,
  "rsi": string,
  "macd": string,
  "bbands": string,
  "volume": string,
  "fibonacci": string,
  "chartPattern": string,
  "verdictParagraph": string,
  "classification": "ADMIN_RESEARCH_NOTE_NOT_BROKER_EXECUTION",
  "disclaimer": string
}`;

export function buildTechnicalUserPrompt(args: {
  ticker: string;
  position: "long" | "short" | "watching";
  technicalSerialized: string;
  personalExposureFlag: "none" | "low" | "elevated" | "high";
  operatorNotes?: string;
}): string {
  const lines: string[] = [];
  lines.push(`TICKER: ${args.ticker}`);
  lines.push(`POSITION: ${args.position}`);
  lines.push(`PERSONAL_EXPOSURE_FLAG: ${args.personalExposureFlag}`);
  lines.push(
    "(personal exposure is operator-set; surface in confidenceStatement only — do NOT alter setupQuality or bias.)",
  );
  if (args.operatorNotes) {
    lines.push("");
    lines.push(`OPERATOR_NOTES: ${args.operatorNotes}`);
  }
  lines.push("");
  lines.push("TECHNICAL_PACKET:");
  lines.push(args.technicalSerialized);
  lines.push("");
  lines.push("Produce the Morgan Stanley-style technical note as the strict JSON object only. No surrounding prose.");
  return lines.join("\n");
}

const FORBIDDEN = [
  /\bbuy now\b/i,
  /\bsell now\b/i,
  /\bexecute (the )?(trade|order|position)\b/i,
  /\bplace (an )?order\b/i,
  /\bdeploy capital\b/i,
  /\bopen a position\b/i,
  /\bsize the position\b/i,
];

export function validateTechnicalNote(
  raw: unknown,
): { ok: true; note: TechnicalNote } | { ok: false; reason: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: "non-object response" };
  }
  const r = raw as Record<string, unknown>;
  const required = [
    "ticker", "tradePlanSummary", "opportunityScore", "evidenceQualityScore",
    "personalExposureFlag", "confidenceStatement", "whatConfirms",
    "whatInvalidates", "mainRisk", "trendAnalysis", "supportResistance",
    "movingAverages", "rsi", "macd", "bbands", "volume", "fibonacci",
    "chartPattern", "verdictParagraph",
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
  r.classification = "ADMIN_RESEARCH_NOTE_NOT_BROKER_EXECUTION";
  r.disclaimer = TECHNICAL_NOTE_DISCLAIMER;
  if (!r.generatedAt) r.generatedAt = new Date().toISOString();
  return { ok: true, note: r as unknown as TechnicalNote };
}

/** Map snapshot health → 0..100 evidence score. */
export function deriveTechnicalEvidenceScore(args: {
  status: string;
  missingCount: number;
  totalIndicators: number;
}): number {
  if (args.status !== "ok") return 0;
  const cov = 1 - args.missingCount / Math.max(args.totalIndicators, 1);
  return Math.round(Math.max(0, Math.min(1, cov)) * 100);
}
