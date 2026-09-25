/**
 * Golden Egg Quick Scoring — Lightweight permission check
 *
 * Extracted from the full Golden Egg analysis (app/api/golden-egg/route.ts)
 * so the opportunity-scan cron can evaluate scanner picks without making
 * expensive API calls. Uses the same 4-pillar weighted score model.
 *
 * Pillars: Structure (30%) + Flow (25%) + Momentum (20%) + Risk (25%); Flow is unavailable in the cron, so the other
 * three are renormalised. Structure/Momentum are measured relative to the setup direction (mirror-symmetric).
 * Permission: TRADE (≥70 + directional) | WATCH | NO_TRADE (<40)
 */

export type Permission = 'TRADE' | 'WATCH' | 'NO_TRADE';
export type Direction = 'LONG' | 'SHORT' | 'NEUTRAL';

export interface QuickGoldenEggInput {
  symbol: string;
  price: number;
  changePct: number;
  high?: number;
  low?: number;
  rsi?: number | null;
  adx?: number | null;
  atr?: number | null;
  macd?: number | null;
  macdHist?: number | null;
  sma20?: number | null;
  sma50?: number | null;
  bbUpper?: number | null;
  bbMiddle?: number | null;
  bbLower?: number | null;
  stochK?: number | null;
  inSqueeze?: boolean;
  /** Scanner direction: 'bullish' | 'bearish' | 'neutral' */
  scannerDirection?: string;
}

export interface QuickGoldenEggResult {
  permission: Permission;
  direction: Direction;
  confidence: number;
  grade: 'A' | 'B' | 'C' | 'D';
  verdict: string;
  /** flow is null when structurally unavailable (cron has no options/MPE data); its weight is renormalised away. */
  breakdown: { structure: number; flow: number | null; momentum: number; risk: number };
}

/**
 * Pillar weights. Flow (25%) needs options/MPE data the cron does not have, so it is STRUCTURALLY unavailable here
 * and the remaining weights are renormalised (Structure 40%, Momentum 26.7%, Risk 33.3%) instead of plugging in a
 * fixed 50 that dragged every score towards the middle.
 */
export const QUICK_GE_WEIGHTS = { structure: 0.30, flow: 0.25, momentum: 0.20, risk: 0.25 } as const;

/** Run a quick Golden Egg evaluation using already-available scanner data. */
export function evaluateGoldenEgg(input: QuickGoldenEggInput): QuickGoldenEggResult {
  // Direction first: Structure and Momentum measure alignment WITH the setup direction, so a clean downtrend scores
  // as high for a SHORT as a clean uptrend does for a LONG (previously both pillars were bullish-absolute and every
  // TRADE verdict in a 3-year replay was LONG).
  let bullish = 0, bearish = 0;
  if (input.rsi != null) { if (input.rsi > 55) bullish++; else if (input.rsi < 45) bearish++; }
  if (input.macd != null) { if (input.macd > 0) bullish++; else if (input.macd < 0) bearish++; }
  if (input.macdHist != null) { if (input.macdHist > 0) bullish++; else if (input.macdHist < 0) bearish++; }
  if (input.changePct > 1) bullish++; else if (input.changePct < -1) bearish++;
  // Use scanner's own direction as an extra signal
  if (input.scannerDirection === 'bullish') bullish++;
  else if (input.scannerDirection === 'bearish') bearish++;

  const direction: Direction = bullish > bearish + 1 ? 'LONG' : bearish > bullish + 1 ? 'SHORT' : 'NEUTRAL';
  const side = direction === 'LONG' ? 1 : direction === 'SHORT' ? -1 : 0;

  const structure = computeStructure(input, side);
  const flow = computeFlow(input);       // null — no options data in cron
  const momentum = computeMomentum(input, side);
  const risk = computeRisk(input);

  const pillars: Array<[number | null, number]> = [
    [structure, QUICK_GE_WEIGHTS.structure], [flow, QUICK_GE_WEIGHTS.flow],
    [momentum, QUICK_GE_WEIGHTS.momentum], [risk, QUICK_GE_WEIGHTS.risk],
  ];
  const usedWeight = pillars.reduce((s, [v, w]) => s + (v == null ? 0 : w), 0);
  const weighted = pillars.reduce((s, [v, w]) => s + (v == null ? 0 : v * w), 0) / (usedWeight || 1);
  const confidence = Math.max(1, Math.min(99, Math.round(weighted)));

  // Permission
  let permission: Permission = 'WATCH';
  if (confidence >= 70 && direction !== 'NEUTRAL') permission = 'TRADE';
  else if (confidence < 40) permission = 'NO_TRADE';

  const grade = confidence >= 75 ? 'A' : confidence >= 60 ? 'B' : confidence >= 40 ? 'C' : 'D';
  const bias = direction === 'LONG' ? 'bullish' : direction === 'SHORT' ? 'bearish' : 'neutral';
  const verdict = permission === 'TRADE'
    ? `High-confluence ${bias} setup — Grade ${grade} (${confidence}%)`
    : permission === 'WATCH'
    ? `Developing ${bias} setup — watch for momentum confirmation (${confidence}%)`
    : `Weak confluence — no clear edge (${confidence}%)`;

  return {
    permission, direction, confidence, grade, verdict,
    breakdown: { structure, flow, momentum, risk },
  };
}

/* ── Scoring pillars ─────────────────────────────────────────────────────
 * `side` = +1 LONG, −1 SHORT, 0 NEUTRAL. Directional terms are multiplied by `side` (mirror-symmetric); trend
 * strength (ADX) is direction-free and counted ONCE, in Structure (it was also +8 in Risk).
 */

function computeStructure(i: QuickGoldenEggInput, side: number): number {
  let directional = 0;
  const p = i.price;
  if (i.sma20 != null) directional += p > i.sma20 ? 10 : -10;
  if (i.sma50 != null) directional += p > i.sma50 ? 10 : -10;
  if (i.sma20 != null && i.sma50 != null) directional += i.sma20 > i.sma50 ? 8 : -8;
  if (i.bbMiddle != null) directional += p > i.bbMiddle ? 5 : -5;
  let score = 50 + side * directional;
  if (i.adx != null) score += i.adx > 25 ? 7 : -3;
  return clamp(score);
}

function computeFlow(_i: QuickGoldenEggInput): number | null {
  // In the full Golden Egg, flow uses options data + MPE. The cron has neither, so Flow is not applicable here and
  // its weight is renormalised away (see QUICK_GE_WEIGHTS) rather than scored as a made-up neutral 50.
  return null;
}

/** RSI momentum points for a LONG; a SHORT uses the mirrored reading (100 − RSI). */
function rsiMomentumPoints(rsi: number): number {
  if (rsi > 55 && rsi < 70) return 12;
  if (rsi >= 70) return 5;
  if (rsi < 45 && rsi > 30) return -10;
  if (rsi <= 30) return -5;
  return 0;
}

function computeMomentum(i: QuickGoldenEggInput, side: number): number {
  if (side === 0) return 50; // no direction → no directional momentum alignment to measure
  let score = 50;
  if (i.rsi != null) score += rsiMomentumPoints(side > 0 ? i.rsi : 100 - i.rsi);
  if (i.macd != null && i.macd !== 0) score += side * (i.macd > 0 ? 8 : -8);
  if (i.macdHist != null && i.macdHist !== 0) score += side * (i.macdHist > 0 ? 7 : -7);
  if (i.stochK != null) {
    if (i.stochK > 80) score += side * 3;
    else if (i.stochK < 20) score -= side * 3;
  }
  const ch = side * i.changePct;
  score += ch > 2 ? 8 : ch > 0 ? 3 : ch < -2 ? -8 : ch < 0 ? -3 : 0;
  return clamp(score);
}

function computeRisk(i: QuickGoldenEggInput): number {
  let score = 60;
  const atr = i.atr ?? (i.high && i.low ? i.high - i.low : null);
  // Unknown ATR is neutral (was treated as 0% ATR = "low volatility" bonus).
  if (atr != null && Number.isFinite(atr) && atr > 0 && i.price > 0) {
    const atrPct = (atr / i.price) * 100;
    if (atrPct > 6) score -= 20;
    else if (atrPct > 4) score -= 10;
    else if (atrPct < 1.5) score += 5;
  }
  if (i.bbUpper && i.bbLower && i.bbMiddle) {
    const bbW = ((i.bbUpper - i.bbLower) / i.bbMiddle) * 100;
    if (bbW < 8) score += 5;
  }
  return clamp(score);
}

function clamp(v: number): number { return Math.max(0, Math.min(100, v)); }
