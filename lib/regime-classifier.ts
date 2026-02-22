// lib/regime-classifier.ts
// Unified Regime Classifier — Single source of truth for all regime taxonomies
//
// Replaces the 3 separate regime systems:
//   1. Scanner API (institutionalFilter): 'trending' | 'ranging' | ... | 'unknown'
//   2. Scoring Engine (regimeScoring): 'TREND_EXPANSION' | 'TREND_MATURE' | ... | 'TRANSITION'
//   3. Risk Governor (risk-governor-hard): 'TREND_UP' | 'TREND_DOWN' | ... | 'RISK_OFF_STRESS'
//
// All three now derive from a single classification function.

import type { ScoringRegime } from '@/lib/ai/regimeScoring';

export type GovernorRegime =
  | 'TREND_UP'
  | 'TREND_DOWN'
  | 'RANGE_NEUTRAL'
  | 'VOL_EXPANSION'
  | 'VOL_CONTRACTION'
  | 'RISK_OFF_STRESS';

export type InstitutionalRegime =
  | 'trending'
  | 'ranging'
  | 'high_volatility_chaos'
  | 'low_liquidity'
  | 'news_shock'
  | 'unknown';

export interface UnifiedRegime {
  /** Risk-governor-hard taxonomy */
  governor: GovernorRegime;
  /** regimeScoring taxonomy */
  scoring: ScoringRegime;
  /** institutionalFilter taxonomy */
  institutional: InstitutionalRegime;
  /** Human-readable label */
  label: string;
  /** Confidence in regime classification 0-100 */
  confidence: number;
}

/**
 * Classify regime from raw indicator data.
 * This is the SINGLE source of truth — all consumers use this.
 */
export function classifyRegime(indicators: {
  adx?: number;
  rsi?: number;
  atrPercent?: number;
  aroonUp?: number;
  aroonDown?: number;
  direction?: 'bullish' | 'bearish' | 'neutral';
  ema200Above?: boolean;
}): UnifiedRegime {
  const { adx, rsi, atrPercent, aroonUp, aroonDown, direction, ema200Above } = indicators;
  const hasAdx = Number.isFinite(adx);
  const hasRsi = Number.isFinite(rsi);
  const hasAtr = Number.isFinite(atrPercent);
  const hasAroon = Number.isFinite(aroonUp) && Number.isFinite(aroonDown);

  let confidence = 30; // Base — insufficient data
  let checks = 0;
  let agreements = 0;

  // === Volatility Extremes (check first — overrides trend) ===
  if (hasAtr && atrPercent! > 7) {
    confidence = 65 + (hasAdx ? 10 : 0);
    return {
      governor: 'VOL_EXPANSION',
      scoring: 'VOL_EXPANSION',
      institutional: 'high_volatility_chaos',
      label: 'Volatility Expansion (Extreme)',
      confidence,
    };
  }

  // === Strong Trend Detection ===
  const trendingAdx = hasAdx && adx! >= 22;
  const rangingAdx = hasAdx && adx! <= 18;
  const strongTrend = hasAdx && adx! >= 30;
  const aroonTrending = hasAroon && Math.abs(aroonUp! - aroonDown!) > 40;
  const aroonRanging = hasAroon && Math.abs(aroonUp! - aroonDown!) < 20;

  // Count signals
  if (hasAdx) checks++;
  if (hasAroon) checks++;
  if (hasRsi) checks++;
  if (hasAtr) checks++;

  // === STRONG TREND ===
  if (trendingAdx || (strongTrend && aroonTrending)) {
    if (trendingAdx) agreements++;
    if (aroonTrending) agreements++;

    const isBullish = direction === 'bullish' || ema200Above === true;
    const isBearish = direction === 'bearish' || ema200Above === false;
    const isMature = hasRsi && ((isBullish && rsi! > 70) || (isBearish && rsi! < 30));

    confidence = 50 + (agreements / Math.max(1, checks)) * 40;
    if (strongTrend) confidence += 10;
    confidence = Math.min(95, confidence);

    if (isMature) {
      return {
        governor: isBullish ? 'TREND_UP' : 'TREND_DOWN',
        scoring: 'TREND_MATURE',
        institutional: 'trending',
        label: `Trend Mature (${isBullish ? 'Bullish' : 'Bearish'})`,
        confidence,
      };
    }

    return {
      governor: isBullish ? 'TREND_UP' : isBearish ? 'TREND_DOWN' : 'TREND_UP',
      scoring: 'TREND_EXPANSION',
      institutional: 'trending',
      label: `Trend Expansion (${isBullish ? 'Bullish' : isBearish ? 'Bearish' : 'Undefined'})`,
      confidence,
    };
  }

  // === RANGE / COMPRESSION ===
  if (rangingAdx || aroonRanging) {
    if (rangingAdx) agreements++;
    if (aroonRanging) agreements++;

    const isCompressed = hasAtr && atrPercent! < 1.5;
    confidence = 45 + (agreements / Math.max(1, checks)) * 35;
    confidence = Math.min(85, confidence);

    if (isCompressed) {
      return {
        governor: 'VOL_CONTRACTION',
        scoring: 'RANGE_COMPRESSION',
        institutional: 'ranging',
        label: 'Range Compression (Low Volatility)',
        confidence,
      };
    }

    return {
      governor: 'RANGE_NEUTRAL',
      scoring: 'RANGE_COMPRESSION',
      institutional: 'ranging',
      label: 'Range Neutral',
      confidence,
    };
  }

  // === VOLATILITY EXPANSION (moderate) ===
  if (hasAtr && atrPercent! > 4) {
    confidence = 50 + (hasAdx ? 10 : 0);
    return {
      governor: 'VOL_EXPANSION',
      scoring: 'VOL_EXPANSION',
      institutional: 'high_volatility_chaos',
      label: 'Volatility Expanded',
      confidence,
    };
  }

  // === TRANSITION (insufficient signals or mixed) ===
  confidence = Math.max(30, 40 + (checks * 5));
  return {
    governor: 'RANGE_NEUTRAL', // Conservative default — NOT TREND_UP
    scoring: 'TRANSITION',
    institutional: 'unknown',
    label: 'Transition (Mixed Signals)',
    confidence: Math.min(55, confidence),
  };
}
