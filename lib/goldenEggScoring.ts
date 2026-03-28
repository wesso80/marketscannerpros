/**
 * Golden Egg Quick Scoring — Lightweight permission check
 *
 * Extracted from the full Golden Egg analysis (app/api/golden-egg/route.ts)
 * so the opportunity-scan cron can evaluate scanner picks without making
 * expensive API calls. Uses the same 4-pillar weighted score model.
 *
 * Pillars: Structure (30%) + Flow (25%) + Momentum (20%) + Risk (25%)
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
  breakdown: { structure: number; flow: number; momentum: number; risk: number };
}

/** Run a quick Golden Egg evaluation using already-available scanner data. */
export function evaluateGoldenEgg(input: QuickGoldenEggInput): QuickGoldenEggResult {
  const structure = computeStructure(input);
  const flow = computeFlow(input);       // limited — no options data in cron
  const momentum = computeMomentum(input);
  const risk = computeRisk(input);

  const weighted = structure * 0.30 + flow * 0.25 + momentum * 0.20 + risk * 0.25;
  const confidence = Math.max(1, Math.min(99, Math.round(weighted)));

  // Direction
  let bullish = 0, bearish = 0;
  if (input.rsi != null) { if (input.rsi > 55) bullish++; else if (input.rsi < 45) bearish++; }
  if (input.macd != null) { if (input.macd > 0) bullish++; else bearish++; }
  if (input.macdHist != null) { if (input.macdHist > 0) bullish++; else bearish++; }
  if (input.changePct > 1) bullish++; else if (input.changePct < -1) bearish++;
  // Use scanner's own direction as an extra signal
  if (input.scannerDirection === 'bullish') bullish++;
  else if (input.scannerDirection === 'bearish') bearish++;

  const direction: Direction = bullish > bearish + 1 ? 'LONG' : bearish > bullish + 1 ? 'SHORT' : 'NEUTRAL';

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

/* ── Scoring pillars (identical to golden-egg/route.ts) ──────────────── */

function computeStructure(i: QuickGoldenEggInput): number {
  let score = 50;
  const p = i.price;
  if (i.sma20 != null) score += p > i.sma20 ? 10 : -10;
  if (i.sma50 != null) score += p > i.sma50 ? 10 : -10;
  if (i.sma20 != null && i.sma50 != null) score += i.sma20 > i.sma50 ? 8 : -8;
  if (i.bbMiddle != null) score += p > i.bbMiddle ? 5 : -5;
  if (i.adx != null) score += i.adx > 25 ? 7 : -3;
  return clamp(score);
}

function computeFlow(_i: QuickGoldenEggInput): number {
  // In the full Golden Egg, flow uses options data + MPE.
  // In the cron context we don't have options, so return a neutral 50.
  // This means the cron skips the 25% flow weight — the other 3 pillars
  // need to be stronger to compensate, making this a higher bar.
  return 50;
}

function computeMomentum(i: QuickGoldenEggInput): number {
  let score = 50;
  if (i.rsi != null) {
    if (i.rsi > 55 && i.rsi < 70) score += 12;
    else if (i.rsi >= 70) score += 5;
    else if (i.rsi < 45 && i.rsi > 30) score -= 10;
    else if (i.rsi <= 30) score -= 5;
  }
  if (i.macd != null) score += i.macd > 0 ? 8 : -8;
  if (i.macdHist != null) score += i.macdHist > 0 ? 7 : -7;
  if (i.stochK != null) {
    if (i.stochK > 80) score += 3;
    else if (i.stochK < 20) score -= 3;
  }
  score += i.changePct > 2 ? 8 : i.changePct > 0 ? 3 : i.changePct < -2 ? -8 : -3;
  return clamp(score);
}

function computeRisk(i: QuickGoldenEggInput): number {
  let score = 60;
  const atr = i.atr ?? (i.high && i.low ? i.high - i.low : 0);
  const atrPct = i.price > 0 ? (atr / i.price) * 100 : 0;
  if (atrPct > 6) score -= 20;
  else if (atrPct > 4) score -= 10;
  else if (atrPct < 1.5) score += 5;
  if (i.adx != null && i.adx > 25) score += 8;
  if (i.bbUpper && i.bbLower && i.bbMiddle) {
    const bbW = ((i.bbUpper - i.bbLower) / i.bbMiddle) * 100;
    if (bbW < 8) score += 5;
  }
  return clamp(score);
}

function clamp(v: number): number { return Math.max(0, Math.min(100, v)); }
