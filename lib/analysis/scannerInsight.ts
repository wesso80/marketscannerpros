/**
 * Scanner insight engine (Scanner rework).
 *
 * Addresses the core weaknesses found in the professional Scanner review:
 *  1. Correlated-indicator double-counting — EMA/MACD/ADX/Aroon collapse to ONE
 *     independent TREND factor (not four bullish votes).
 *  2. Relative strength becomes a first-class independent factor (data already
 *     computed by lib/scannerEnhancements.ts).
 *  3. Explicit SETUP STAGE (DORMANT/BUILDING/CONFIRMING/EXPANDING/EXTENDED/FADING)
 *     from volatility phase + participation + price containment.
 *  4. EXTENSION state (EARLY/NORMAL/ELEVATED/EXTREME) so already-run names are
 *     labelled, not silently top-ranked.
 *  5. Evidence quality CAPS the headline composite, and every row gets an
 *     explainable "why it ranked" + cautions.
 *
 * This layer does NOT replace the battle-tested computeScore conviction/direction
 * math in the scanner route — it augments each row with an honest, independent
 * factor breakdown. Pure and dependency-light for testing/reuse.
 *
 * Everything here is educational market analysis: it describes conditions and
 * evidence. It never issues buy/sell instructions and never presents composites
 * as probabilities.
 */

import { formatCompositeScore, type CompositeScoreDisplay, type FreshnessLevel } from './terminology';
import {
  summarizeConfluence,
  FACTOR_GROUP_LABEL,
  type FactorAssessment,
  type FactorSignal,
  type ConfluenceSummary,
} from './factorGroups';
import { assessEvidenceQuality, type EvidenceQualityResult } from './evidenceQuality';

export type SetupStage = 'DORMANT' | 'BUILDING' | 'CONFIRMING' | 'EXPANDING' | 'EXTENDED' | 'FADING';
export type ExtensionState = 'EARLY' | 'NORMAL' | 'ELEVATED' | 'EXTREME';

export interface ScannerInsightInput {
  direction?: 'bullish' | 'bearish' | 'neutral';
  /** The scanner's existing 0–100 conviction score (from computeScore). */
  convictionScore?: number;
  /** Recent price change (%) over the scanned window. */
  changePct?: number;
  /** Single most-recent bar move (%), if available. */
  lastBarMovePct?: number;

  // ── Trend inputs (collapse to ONE factor) ──
  close?: number;
  ema200?: number;
  macdHist?: number;
  macd?: number;
  macdSignal?: number;
  adx?: number;
  plusDI?: number;
  minusDI?: number;
  aroonUp?: number;
  aroonDown?: number;
  /** Pre-computed EMA-stack alignment ('bullish'|'bearish'|'mixed'), if available. */
  emaStack?: 'bullish' | 'bearish' | 'mixed' | 'neutral';

  // ── Momentum ──
  rsi?: number;
  stochK?: number;
  stochD?: number;
  cci?: number;

  // ── Participation ──
  obvChangePct?: number;
  mfi?: number;
  vwapPct?: number;
  /** Volume relative to a baseline/cohort (1.0 = average), if available. */
  relativeVolume?: number;

  // ── Volatility ──
  bbwp?: number;
  dveBreakoutScore?: number;
  dveFlags?: string[];
  atrPercent?: number;

  // ── Relative strength (vs benchmark) ──
  relativeStrengthRatio?: number | null;

  // ── Positioning (crypto) ──
  fundingRate?: number;
  oiChangePercent?: number;

  freshness?: FreshnessLevel;
}

export interface ScannerInsight {
  factors: FactorAssessment[];
  confluence: ConfluenceSummary;
  evidenceQuality: EvidenceQualityResult;
  setupStage: SetupStage;
  extensionState: ExtensionState;
  relativeStrength: { ratio: number; label: string } | null;
  /** Composite strength, capped by evidence quality (never a probability). */
  composite: CompositeScoreDisplay;
  whyRanked: string[];
  cautions: string[];
}

/* ── helpers ── */

function majority(signals: FactorSignal[]): FactorSignal {
  let bull = 0, bear = 0, neutral = 0;
  for (const s of signals) {
    if (s === 'bullish') bull++;
    else if (s === 'bearish') bear++;
    else if (s === 'neutral') neutral++;
  }
  if (bull === 0 && bear === 0 && neutral === 0) return 'unknown';
  if (bull > bear) return 'bullish';
  if (bear > bull) return 'bearish';
  return 'neutral';
}

function num(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function deriveTrend(i: ScannerInsightInput): FactorSignal {
  const subs: FactorSignal[] = [];
  if (num(i.ema200) && num(i.close) && i.ema200 !== 0) {
    const pct = ((i.close - i.ema200) / i.ema200) * 100;
    subs.push(pct > 1 ? 'bullish' : pct < -1 ? 'bearish' : 'neutral');
  }
  if (num(i.macdHist) && num(i.macd) && num(i.macdSignal)) {
    const bull = i.macdHist > 0 && i.macd > i.macdSignal;
    const bear = i.macdHist < 0 && i.macd < i.macdSignal;
    subs.push(bull ? 'bullish' : bear ? 'bearish' : 'neutral');
  } else if (num(i.macdHist)) {
    // Histogram-only fallback (scanner rows store macd_hist, not the raw lines).
    subs.push(i.macdHist > 0 ? 'bullish' : i.macdHist < 0 ? 'bearish' : 'neutral');
  }
  if (num(i.plusDI) && num(i.minusDI)) {
    const diff = i.plusDI - i.minusDI;
    const strong = num(i.adx) && i.adx >= 20;
    subs.push(diff > 3 && strong ? 'bullish' : diff < -3 && strong ? 'bearish' : 'neutral');
  }
  if (num(i.aroonUp) && num(i.aroonDown)) {
    const osc = i.aroonUp - i.aroonDown;
    subs.push(osc > 20 ? 'bullish' : osc < -20 ? 'bearish' : 'neutral');
  }
  if (i.emaStack && i.emaStack !== 'neutral') {
    subs.push(i.emaStack === 'mixed' ? 'neutral' : i.emaStack);
  }
  return subs.length ? majority(subs) : 'unknown';
}

function deriveMomentum(i: ScannerInsightInput): FactorSignal {
  const subs: FactorSignal[] = [];
  if (num(i.rsi)) {
    // Trend-respecting: overbought/oversold treated as neutral (not a reversal vote).
    subs.push(i.rsi >= 55 && i.rsi <= 70 ? 'bullish' : i.rsi >= 30 && i.rsi <= 45 ? 'bearish' : 'neutral');
  }
  if (num(i.stochK) && num(i.stochD)) {
    subs.push(i.stochK > i.stochD ? 'bullish' : i.stochK < i.stochD ? 'bearish' : 'neutral');
  }
  if (num(i.cci)) {
    subs.push(i.cci > 0 ? 'bullish' : i.cci < 0 ? 'bearish' : 'neutral');
  }
  return subs.length ? majority(subs) : 'unknown';
}

function deriveParticipation(i: ScannerInsightInput): FactorSignal {
  const subs: FactorSignal[] = [];
  if (num(i.obvChangePct)) subs.push(i.obvChangePct > 0.5 ? 'bullish' : i.obvChangePct < -0.5 ? 'bearish' : 'neutral');
  if (num(i.mfi)) subs.push(i.mfi >= 60 ? 'bullish' : i.mfi <= 40 ? 'bearish' : 'neutral');
  if (num(i.vwapPct)) subs.push(i.vwapPct > 0.2 ? 'bullish' : i.vwapPct < -0.2 ? 'bearish' : 'neutral');
  return subs.length ? majority(subs) : 'unknown';
}

function deriveRelativeStrength(ratio: number | null | undefined): FactorSignal {
  if (!num(ratio)) return 'unknown';
  if (ratio >= 1.03) return 'bullish';
  if (ratio <= 0.97) return 'bearish';
  return 'neutral';
}

function derivePositioning(i: ScannerInsightInput): { signal: FactorSignal; caution: boolean } {
  if (!num(i.fundingRate) && !num(i.oiChangePercent)) return { signal: 'unknown', caution: false };
  // Extreme funding is a crowding caution regardless of direction.
  const extreme = num(i.fundingRate) && Math.abs(i.fundingRate) >= 0.05;
  let signal: FactorSignal = 'neutral';
  if (num(i.fundingRate)) signal = i.fundingRate > 0.005 ? 'bullish' : i.fundingRate < -0.005 ? 'bearish' : 'neutral';
  return { signal, caution: Boolean(extreme) };
}

function deriveExtension(i: ScannerInsightInput): ExtensionState {
  const distEma = num(i.ema200) && num(i.close) && i.ema200 !== 0 ? Math.abs(((i.close - i.ema200) / i.ema200) * 100) : 0;
  const atrP = num(i.atrPercent) ? i.atrPercent : 0;
  const bar = num(i.lastBarMovePct) ? Math.abs(i.lastBarMovePct) : 0;
  const bbwp = num(i.bbwp) ? i.bbwp : undefined;

  if (distEma > 25 || atrP > 8 || (bbwp !== undefined && bbwp >= 95) || bar > 12) return 'EXTREME';
  if (distEma > 12 || atrP > 5 || (bbwp !== undefined && bbwp >= 85) || bar > 7) return 'ELEVATED';
  if (bbwp !== undefined && bbwp < 20 && distEma < 5) return 'EARLY';
  return 'NORMAL';
}

function deriveSetupStage(
  i: ScannerInsightInput,
  confluence: ConfluenceSummary,
  extension: ExtensionState,
  participation: FactorSignal,
): SetupStage {
  const absChange = num(i.changePct) ? Math.abs(i.changePct) : 0;
  const bbwp = num(i.bbwp) ? i.bbwp : undefined;
  const compression = bbwp !== undefined && bbwp < 25;
  const expansion = bbwp !== undefined && bbwp > 75;
  const participationSupportive = participation === 'bullish' || participation === 'bearish';
  const rsWeak = num(i.relativeStrengthRatio) && i.relativeStrengthRatio <= 0.97;
  const flags = i.dveFlags ?? [];

  if (extension === 'EXTREME' || (expansion && absChange >= 8)) return 'EXTENDED';
  if (flags.includes('EXHAUSTION_RISK') || rsWeak) return 'FADING';
  if (compression && participationSupportive && absChange < 3) return 'BUILDING';
  if ((confluence.agreement === 'strong' || confluence.agreement === 'moderate') && participationSupportive && absChange >= 3 && absChange < 8) return 'CONFIRMING';
  if (expansion && absChange >= 3) return 'EXPANDING';
  return 'DORMANT';
}

const RS_LABEL = (rs: number): string =>
  rs >= 1.15 ? 'Strong outperformer'
    : rs >= 1.03 ? 'Outperformer'
      : rs >= 0.97 ? 'In-line'
        : rs >= 0.85 ? 'Underperformer'
          : 'Strong underperformer';

const EVIDENCE_CAP: Record<EvidenceQualityResult['level'], number> = {
  HIGH: 100,
  MEDIUM: 80,
  LOW: 60,
  INSUFFICIENT: 40,
};

/** Build the full scanner insight for one row. */
export function buildScannerInsight(input: ScannerInsightInput): ScannerInsight {
  const trend = deriveTrend(input);
  const momentum = deriveMomentum(input);
  const participation = deriveParticipation(input);
  const relStrength = deriveRelativeStrength(input.relativeStrengthRatio);
  const positioning = derivePositioning(input);

  const factors: FactorAssessment[] = [];
  if (trend !== 'unknown') factors.push({ group: 'TREND', signal: trend });
  if (momentum !== 'unknown') factors.push({ group: 'MOMENTUM', signal: momentum });
  if (participation !== 'unknown') factors.push({ group: 'VOLUME', signal: participation });
  if (relStrength !== 'unknown') factors.push({ group: 'RELATIVE_STRENGTH', signal: relStrength });
  if (positioning.signal !== 'unknown') factors.push({ group: 'POSITIONING', signal: positioning.signal, caution: positioning.caution || undefined });
  // Volatility contributes coverage + caution, not a directional vote.
  if (num(input.bbwp) || num(input.dveBreakoutScore)) {
    const volCaution = (input.dveFlags ?? []).some((f) => f === 'VOL_TRAP' || f === 'EXHAUSTION_RISK');
    factors.push({ group: 'VOLATILITY', signal: 'neutral', caution: volCaution || undefined });
  }

  const reference = input.direction === 'bullish' ? 'bullish' : input.direction === 'bearish' ? 'bearish' : undefined;
  const confluence = summarizeConfluence(factors, reference);

  const extensionState = deriveExtension(input);
  const setupStage = deriveSetupStage(input, confluence, extensionState, participation);

  const evidenceQuality = assessEvidenceQuality({
    availableFactors: confluence.independentFactors,
    totalFactors: 6,
    freshness: input.freshness ?? 'unknown',
    conflicting: confluence.agreement === 'conflicting',
  });

  // Evidence quality CAPS the composite (change #5): poor/stale evidence cannot
  // produce a high headline number.
  const rawScore = num(input.convictionScore) ? input.convictionScore : 0;
  const composite = formatCompositeScore(Math.min(rawScore, EVIDENCE_CAP[evidenceQuality.level]));

  // Relative strength surface object
  const relativeStrength = num(input.relativeStrengthRatio)
    ? { ratio: input.relativeStrengthRatio, label: RS_LABEL(input.relativeStrengthRatio) }
    : null;

  // "Why it ranked" — supportive independent factors + RS + stage
  const whyRanked: string[] = [];
  for (const f of factors) {
    if (reference && f.signal === reference) whyRanked.push(`${FACTOR_GROUP_LABEL[f.group]} supportive`);
  }
  if (relativeStrength && (relativeStrength.ratio >= 1.03 || relativeStrength.ratio <= 0.97)) {
    whyRanked.push(`Relative strength: ${relativeStrength.label.toLowerCase()}`);
  }
  if (num(input.relativeVolume) && input.relativeVolume >= 1.5) whyRanked.push(`Volume ${input.relativeVolume.toFixed(1)}× baseline`);
  if (extensionState === 'EARLY') whyRanked.push('Volatility compressed (pre-expansion)');
  if ((input.dveFlags ?? []).includes('SQUEEZE_FIRE')) whyRanked.push('Volatility squeeze firing');
  if (setupStage === 'BUILDING') whyRanked.push('Participation building while price contained');

  // Cautions
  const cautions: string[] = [];
  if (extensionState === 'ELEVATED') cautions.push('Move is becoming extended');
  if (extensionState === 'EXTREME') cautions.push('Move is already extended');
  if ((input.dveFlags ?? []).includes('EXHAUSTION_RISK')) cautions.push('Exhaustion risk flagged');
  if ((input.dveFlags ?? []).includes('VOL_TRAP')) cautions.push('Volatility-trap risk flagged');
  if (positioning.caution) cautions.push('Crowded funding — squeeze risk');
  if (confluence.agreement === 'conflicting') cautions.push('Independent factors disagree');
  if (evidenceQuality.level === 'LOW' || evidenceQuality.level === 'INSUFFICIENT') cautions.push(`Evidence quality: ${evidenceQuality.level.toLowerCase()}`);
  if (input.freshness === 'stale') cautions.push('Underlying data is stale');

  return {
    factors,
    confluence,
    evidenceQuality,
    setupStage,
    extensionState,
    relativeStrength,
    composite,
    whyRanked,
    cautions,
  };
}
