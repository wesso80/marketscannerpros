/**
 * MSP technical analysis note schema + prompt.
 *
 * Boundary: this is a private operator desktop. The system itself
 * never places, routes, or auto-executes orders — that is the only
 * hard rule. The note speaks operator-grade: explicit entry/stop/
 * targets, sizing in R-multiples, and a recommendedAction verb. The
 * operator decides whether to act.
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

  /** Operator-grade recommended action. */
  recommendedAction: {
    action:
      | "enter-long"
      | "enter-short"
      | "add"
      | "trim"
      | "exit"
      | "stand-aside"
      | "hold";
    sizing: string;            // e.g. "1.0R initial, add 0.5R on confirmation"
    urgency: "now" | "on-trigger" | "patient" | "n/a";
    triggerCondition: string;  // e.g. "break $X on >1.5x avg volume" or "n/a"
    rationale: string;
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
  "Operator-grade technical note for private desktop research. The system does not place, route, or auto-execute orders — all actions remain operator-driven.";

export const TECHNICAL_NOTE_SYSTEM_PROMPT = `You are a senior technical strategist (20 yrs experience) writing a private operator-grade chart note for the desk's principal trader. The reader IS the operator. Speak directly. Give a clear trade plan.

HARD RULES:
- The system does NOT place, route, or auto-execute any orders. NEVER claim an order was placed, filled, routed, or executed by the system. Phrases like "order has been placed", "trade has been executed", "position opened by the system", and "auto-execute" are FORBIDDEN.
- You MAY (and should) give direct operator-grade calls: "enter long at $X", "cut if it breaks $Y", "trim half at $Z", "size at 1R", "stand aside". These are recommendations to the operator, not system actions.
- Use ONLY the TECHNICAL_PACKET provided. Do NOT invent indicator values. If a value is missing, write "n/a (not in packet)" and lower confidence.
- Risk-reward must be computed from the levels you choose, not asserted.
- Setup quality 1..5 — never higher than the evidence supports. If indicators conflict, cap at 2.
- Bias must align with at least 2 of: trend, MACD, price-vs-200SMA. If they conflict, bias=neutral and recommendedAction.action="stand-aside".
- recommendedAction.sizing is in R-multiples (1R = the dollar risk between entry and stop). Never give absolute % portfolio sizing — the operator owns book context.
- recommendedAction.urgency: "now" only if price is at the entry level AND triggers are confirmed; otherwise "on-trigger" or "patient".

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
  "recommendedAction": {
    "action": "enter-long"|"enter-short"|"add"|"trim"|"exit"|"stand-aside"|"hold",
    "sizing": string,
    "urgency": "now"|"on-trigger"|"patient"|"n/a",
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
  lines.push("Produce the MSP technical note as the strict JSON object only. No surrounding prose.");
  return lines.join("\n");
}

/**
 * Only block phrases that imply the SYSTEM executed an order.
 * Operator-directed language ("enter long", "exit", "size at 1R") is allowed.
 */
const FORBIDDEN = [
  /\border (has been |is being |was )?(placed|filled|routed|submitted|sent)\b/i,
  /\btrade (has been |was )?(executed|filled|placed)\b/i,
  /\bposition (has been |was )?(opened|closed) by (the )?system\b/i,
  /\bauto-?execut(e|ed|ing|ion)\b/i,
  /\bbroker (api|connection|integration|hookup)\b/i,
  /\bI (have |just )?(placed|executed|filled|submitted)\b/i,
];

export function validateTechnicalNote(
  raw: unknown,
): { ok: true; note: TechnicalNote } | { ok: false; reason: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: "non-object response" };
  }
  const r = raw as Record<string, unknown>;
  const required = [
    "ticker", "tradePlanSummary", "recommendedAction", "opportunityScore",
    "evidenceQualityScore", "personalExposureFlag", "confidenceStatement",
    "whatConfirms", "whatInvalidates", "mainRisk", "trendAnalysis",
    "supportResistance", "movingAverages", "rsi", "macd", "bbands",
    "volume", "fibonacci", "chartPattern", "verdictParagraph",
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
