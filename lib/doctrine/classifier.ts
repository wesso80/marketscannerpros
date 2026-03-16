/* ═══════════════════════════════════════════════════════════════════════════
   MSP v3 — ARCA Doctrine Classifier
   Given golden-egg data, identifies which doctrine pattern is active.
   ═══════════════════════════════════════════════════════════════════════════ */

import type { DoctrineMatch, DoctrineId, Regime } from './types';
import { PLAYBOOKS } from './registry';

// ─── Input: normalized snapshot from golden-egg or scanner ────────────────────

export interface ClassifierInput {
  /** DVE volatility regime */
  dveRegime: string;
  /** BBWP value (0-100) */
  bbwp: number | null;
  /** DVE signal type (e.g. 'decompression', 'expansion', etc.) */
  dveSignalType?: string;
  /** DVE breakout score (0-100) */
  breakoutScore?: number;
  /** RSI value */
  rsi: number | null;
  /** MACD histogram */
  macdHist: number | null;
  /** ADX value */
  adx: number | null;
  /** Stochastic K */
  stochK: number | null;
  /** Price vs SMA20 (percentage above/below) */
  priceVsSma20Pct: number | null;
  /** Price vs SMA50 (percentage above/below) */
  priceVsSma50Pct: number | null;
  /** Volume relative to average (e.g. 1.5 = 150% of avg) */
  volumeRatio: number | null;
  /** Golden egg verdict: TRADE / WATCH / NO_TRADE */
  permission: string;
  /** Direction: LONG / SHORT / NEUTRAL */
  direction: string;
  /** Confluence confidence (1-99) */
  confidence: number;
  /** Setup type from golden egg */
  setupType?: string;
  /** Options verdict: agree / neutral / disagree */
  optionsVerdict?: string;
  /** Near OPEX (within 3 days) */
  nearOpex?: boolean;
  /** Is there a squeeze detected */
  inSqueeze?: boolean;
  /** Structure trend alignment */
  structureVerdict?: string;
  /** DVE directional bias */
  directionalBias?: string;
  /** DVE trap detected */
  trapDetected?: boolean;
  /** DVE exhaustion risk */
  exhaustionRisk?: number;
}

// ─── Classifier ───────────────────────────────────────────────────────────────

export function classifyDoctrine(input: ClassifierInput): DoctrineMatch[] {
  const matches: DoctrineMatch[] = [];
  const regime = normalizeRegime(input.dveRegime);

  // Score each playbook against the input
  for (const playbook of PLAYBOOKS) {
    const { score, reasons } = scorePlaybook(playbook.id, input, regime);
    if (score >= 40) {
      matches.push({
        doctrineId: playbook.id,
        matchConfidence: Math.min(100, Math.round(score)),
        reasons,
        regimeCompatible: playbook.compatibleRegimes.includes(regime),
        playbook,
      });
    }
  }

  // Sort by confidence, regime-compatible first
  matches.sort((a, b) => {
    if (a.regimeCompatible !== b.regimeCompatible) return a.regimeCompatible ? -1 : 1;
    return b.matchConfidence - a.matchConfidence;
  });

  return matches.slice(0, 3); // Top 3 matches
}

/** Return the single best doctrine, or null */
export function classifyBestDoctrine(input: ClassifierInput): DoctrineMatch | null {
  const matches = classifyDoctrine(input);
  return matches[0] ?? null;
}

// ─── Per-playbook scoring ─────────────────────────────────────────────────────

function scorePlaybook(
  id: DoctrineId,
  i: ClassifierInput,
  regime: Regime,
): { score: number; reasons: string[] } {
  switch (id) {
    case 'compression_breakout': return scoreCompressionBreakout(i, regime);
    case 'vol_expansion_breakout': return scoreVolExpansionBreakout(i, regime);
    case 'trend_continuation': return scoreTrendContinuation(i, regime);
    case 'trend_pullback': return scoreTrendPullback(i, regime);
    case 'liquidity_sweep_reversal': return scoreLiquiditySweep(i, regime);
    case 'range_fade': return scoreRangeFade(i, regime);
    case 'gamma_pin': return scoreGammaPin(i, regime);
    case 'gamma_squeeze': return scoreGammaSqueeze(i, regime);
    case 'mean_reversion': return scoreMeanReversion(i, regime);
    case 'momentum_burst': return scoreMomentumBurst(i, regime);
    default: return { score: 0, reasons: [] };
  }
}

// ─── Individual scorers ───────────────────────────────────────────────────────

function scoreCompressionBreakout(i: ClassifierInput, regime: Regime) {
  let score = 0;
  const reasons: string[] = [];

  if (i.bbwp != null && i.bbwp < 20) { score += 30; reasons.push(`BBWP compressed at ${i.bbwp.toFixed(0)}`); }
  else if (i.bbwp != null && i.bbwp < 35) { score += 15; reasons.push('BBWP moderately compressed'); }

  if (i.inSqueeze) { score += 15; reasons.push('Squeeze detected'); }
  if (regime === 'compression' || regime === 'transition') { score += 15; reasons.push(`Compatible regime: ${regime}`); }
  if (i.dveSignalType === 'decompression') { score += 15; reasons.push('DVE decompression signal'); }
  if (i.breakoutScore != null && i.breakoutScore > 60) { score += 10; reasons.push(`Breakout score: ${i.breakoutScore}`); }
  if (i.volumeRatio != null && i.volumeRatio > 1.3) { score += 10; reasons.push('Volume expanding'); }
  if (i.confidence >= 65) { score += 5; reasons.push('Strong confluence'); }

  return { score, reasons };
}

function scoreVolExpansionBreakout(i: ClassifierInput, regime: Regime) {
  let score = 0;
  const reasons: string[] = [];

  if (regime === 'expansion' || regime === 'transition') { score += 20; reasons.push(`Expansion/transition regime: ${regime}`); }
  if (i.bbwp != null && i.bbwp > 70) { score += 20; reasons.push(`BBWP elevated at ${i.bbwp.toFixed(0)}`); }
  if (i.volumeRatio != null && i.volumeRatio > 1.5) { score += 20; reasons.push('Volume surge > 1.5x avg'); }
  if (i.breakoutScore != null && i.breakoutScore > 70) { score += 15; reasons.push('Strong breakout score'); }
  if (i.adx != null && i.adx > 25) { score += 10; reasons.push('ADX confirms trend strength'); }
  if (i.confidence >= 70) { score += 10; reasons.push('High confluence'); }

  return { score, reasons };
}

function scoreTrendContinuation(i: ClassifierInput, regime: Regime) {
  let score = 0;
  const reasons: string[] = [];

  if (regime === 'trend') { score += 25; reasons.push('Trend regime active'); }
  if (i.adx != null && i.adx > 25) { score += 15; reasons.push(`ADX strong at ${i.adx.toFixed(0)}`); }
  if (i.rsi != null && i.rsi > 45 && i.rsi < 65) { score += 15; reasons.push('RSI in continuation zone (45-65)'); }
  if (i.structureVerdict === 'agree') { score += 10; reasons.push('Structure confirms trend'); }
  if (i.macdHist != null && Math.abs(i.macdHist) > 0) {
    const aligned = (i.direction === 'LONG' && i.macdHist > 0) || (i.direction === 'SHORT' && i.macdHist < 0);
    if (aligned) { score += 10; reasons.push('MACD aligned with direction'); }
  }
  if (i.volumeRatio != null && i.volumeRatio > 1.0) { score += 5; reasons.push('Healthy volume'); }
  if (i.confidence >= 60) { score += 5; reasons.push('Solid confluence'); }

  return { score, reasons };
}

function scoreTrendPullback(i: ClassifierInput, regime: Regime) {
  let score = 0;
  const reasons: string[] = [];

  if (regime === 'trend') { score += 20; reasons.push('Trend regime active'); }
  if (i.priceVsSma20Pct != null && Math.abs(i.priceVsSma20Pct) < 2) { score += 20; reasons.push('Price near SMA20 (pullback zone)'); }
  if (i.rsi != null && i.rsi > 35 && i.rsi < 55) { score += 15; reasons.push('RSI pulled back (35-55)'); }
  if (regime === 'compression' || (i.dveRegime && i.dveRegime.includes('neutral'))) { score += 10; reasons.push('Vol pause during pullback'); }
  if (i.adx != null && i.adx > 20) { score += 10; reasons.push('Trend still intact (ADX > 20)'); }
  if (i.structureVerdict === 'agree') { score += 10; reasons.push('Structure supports pullback entry'); }
  if (i.confidence >= 55) { score += 5; reasons.push('Adequate confluence'); }

  return { score, reasons };
}

function scoreLiquiditySweep(i: ClassifierInput, regime: Regime) {
  let score = 0;
  const reasons: string[] = [];

  if (regime === 'range' || regime === 'transition') { score += 20; reasons.push(`Range/transition regime: ${regime}`); }
  if (i.trapDetected) { score += 25; reasons.push('DVE trap detected — sweep pattern'); }
  if (i.volumeRatio != null && i.volumeRatio > 1.5) { score += 15; reasons.push('Volume spike on sweep'); }
  if (i.setupType === 'reversal') { score += 15; reasons.push('Setup type identified as reversal'); }
  if (i.rsi != null && (i.rsi < 30 || i.rsi > 70)) { score += 10; reasons.push('RSI at extreme (potential reversal)'); }
  if (i.optionsVerdict && i.optionsVerdict !== 'neutral') { score += 5; reasons.push('Options flow supports reversal'); }

  return { score, reasons };
}

function scoreRangeFade(i: ClassifierInput, regime: Regime) {
  let score = 0;
  const reasons: string[] = [];

  if (regime === 'range') { score += 25; reasons.push('Range regime active'); }
  if (i.setupType === 'range' || i.setupType === 'mean_reversion') { score += 15; reasons.push('Setup classified as range/mean reversion'); }
  if (i.rsi != null && (i.rsi < 35 || i.rsi > 65)) { score += 15; reasons.push('RSI at range extreme'); }
  if (i.optionsVerdict && i.optionsVerdict !== 'neutral') { score += 10; reasons.push('Options flow opposes continuation'); }
  if (i.stochK != null && (i.stochK < 20 || i.stochK > 80)) { score += 10; reasons.push('Stochastic at extreme'); }
  if (i.adx != null && i.adx < 25) { score += 10; reasons.push('ADX confirms no trend (ranging)'); }

  return { score, reasons };
}

function scoreGammaPin(i: ClassifierInput, regime: Regime) {
  let score = 0;
  const reasons: string[] = [];

  if (i.nearOpex) { score += 30; reasons.push('Near options expiry (OPEX)'); }
  if (regime === 'range' || regime === 'compression') { score += 15; reasons.push('Low-vol regime supports pin'); }
  if (i.optionsVerdict === 'agree' || i.optionsVerdict === 'neutral') { score += 10; reasons.push('Options dynamics support pin'); }
  if (i.bbwp != null && i.bbwp < 35) { score += 10; reasons.push('Low volatility supports pin dynamics'); }
  if (i.adx != null && i.adx < 20) { score += 10; reasons.push('No trend momentum to break pin'); }

  return { score, reasons };
}

function scoreGammaSqueeze(i: ClassifierInput, regime: Regime) {
  let score = 0;
  const reasons: string[] = [];

  if (regime === 'transition' || regime === 'expansion') { score += 20; reasons.push(`Active regime: ${regime}`); }
  if (i.optionsVerdict === 'agree') { score += 20; reasons.push('Options flow strongly aligned'); }
  if (i.bbwp != null && i.bbwp > 60) { score += 15; reasons.push('Volatility expanding'); }
  if (i.volumeRatio != null && i.volumeRatio > 2.0) { score += 15; reasons.push('Volume surge > 2x average'); }
  if (i.breakoutScore != null && i.breakoutScore > 70) { score += 10; reasons.push('Strong breakout score'); }
  if (i.direction !== 'NEUTRAL') { score += 5; reasons.push('Directional bias established'); }

  return { score, reasons };
}

function scoreMeanReversion(i: ClassifierInput, regime: Regime) {
  let score = 0;
  const reasons: string[] = [];

  if (i.rsi != null && (i.rsi < 25 || i.rsi > 75)) { score += 25; reasons.push(`RSI extreme at ${i.rsi.toFixed(0)}`); }
  else if (i.rsi != null && (i.rsi < 30 || i.rsi > 70)) { score += 15; reasons.push('RSI approaching extreme'); }

  if (i.priceVsSma20Pct != null && Math.abs(i.priceVsSma20Pct) > 4) { score += 20; reasons.push(`Price ${Math.abs(i.priceVsSma20Pct).toFixed(1)}% from SMA20`); }
  if (i.stochK != null && (i.stochK < 15 || i.stochK > 85)) { score += 15; reasons.push('Stochastic at extreme'); }
  if (regime === 'range' || regime === 'expansion') { score += 10; reasons.push('Regime supports mean reversion'); }
  if (i.exhaustionRisk != null && i.exhaustionRisk > 0.5) { score += 10; reasons.push('DVE detects exhaustion'); }
  if (i.setupType === 'mean_reversion') { score += 10; reasons.push('Setup classified as mean reversion'); }

  return { score, reasons };
}

function scoreMomentumBurst(i: ClassifierInput, regime: Regime) {
  let score = 0;
  const reasons: string[] = [];

  if (regime === 'trend' || regime === 'expansion') { score += 20; reasons.push(`Supportive regime: ${regime}`); }
  if (i.volumeRatio != null && i.volumeRatio > 2.0) { score += 20; reasons.push('Volume surge > 2x average'); }
  if (i.macdHist != null && Math.abs(i.macdHist) > 0) {
    const aligned = (i.direction === 'LONG' && i.macdHist > 0) || (i.direction === 'SHORT' && i.macdHist < 0);
    if (aligned) { score += 15; reasons.push('MACD momentum aligned'); }
  }
  if (i.rsi != null && i.rsi > 55 && i.rsi < 80) { score += 10; reasons.push('RSI strong but not exhausted'); }
  if (i.adx != null && i.adx > 30) { score += 15; reasons.push(`Strong trend intensity (ADX ${i.adx.toFixed(0)})`); }
  if (i.confidence >= 70) { score += 10; reasons.push('High confluence'); }

  return { score, reasons };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeRegime(raw: string): Regime {
  const lower = (raw || '').toLowerCase().trim();
  if (lower.includes('trend')) return 'trend';
  if (lower.includes('range')) return 'range';
  if (lower.includes('compress') || lower.includes('neutral')) return 'compression';
  if (lower.includes('transit')) return 'transition';
  if (lower.includes('expan') || lower.includes('climax')) return 'expansion';
  return 'compression'; // default fallback
}
