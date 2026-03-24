/**
 * Extract MRI (Market Regime Intel) — standalone callable wrapper
 *
 * PRIVATE INTERNAL — wraps the regime detection logic from
 * options-confluence-analyzer into a lightweight, independently callable function.
 * The original function is deeply embedded inside the class; this provides a
 * simplified extraction for the quant pipeline that uses only directional
 * strength, IV rank, signal alignment counts, and conflict detection.
 */

import type { MarketRegimeType } from '@/lib/options-confluence-analyzer';

export interface MRIInput {
  directionScore: number;     // -100..+100 from composite score
  signalAlignment: number;    // 0-100 confidence / alignment %
  ivRank: number;             // 0-100 implied volatility rank
  conflictCount: number;      // Number of signal conflicts
  direction: 'bullish' | 'bearish' | 'neutral';
}

export interface MRIResult {
  regime: MarketRegimeType;
  confidence: number;
  reason: string;
  characteristics: string[];
}

/**
 * Standalone MRI regime detection — mirrors the logic in
 * calculateAIMarketState (options-confluence-analyzer.ts lines 2744-2798)
 * without requiring the full options analysis pipeline.
 */
export function extractMRI(input: MRIInput): MRIResult {
  const { directionScore, signalAlignment, ivRank, conflictCount, direction } = input;
  const dirStrength = Math.abs(directionScore);

  let regime: MarketRegimeType = 'RANGE';
  let confidence = 50;
  let reason = '';
  const characteristics: string[] = [];

  // TREND: Strong directional signals + aligned
  if (dirStrength > 40 && signalAlignment > 60) {
    regime = 'TREND';
    confidence = Math.min(95, 50 + dirStrength * 0.5 + signalAlignment * 0.3);
    reason = 'Strong directional alignment across multiple factors';
    characteristics.push('Directional momentum detected');
    if (direction === 'bullish') {
      characteristics.push('Bullish trend structure');
    } else if (direction === 'bearish') {
      characteristics.push('Bearish trend structure');
    }
  }
  // EXPANSION: High IV + mixed signals = volatility breakout
  else if (ivRank > 70 && signalAlignment < 50) {
    regime = 'EXPANSION';
    confidence = Math.min(90, 40 + ivRank * 0.4);
    reason = 'High volatility with uncertain direction — potential breakout';
    characteristics.push('Elevated implied volatility');
    characteristics.push('Conflicting directional signals');
    characteristics.push('Volatility expansion likely');
  }
  // REVERSAL: Strong opposite signals
  else if (conflictCount >= 2 && dirStrength > 25) {
    regime = 'REVERSAL';
    confidence = Math.min(80, 30 + conflictCount * 15);
    reason = 'Conflicting signals suggest potential trend change';
    characteristics.push('Price/flow divergence');
    characteristics.push('Multiple signal conflicts');
  }
  // RANGE: Default — low directional edge
  else {
    regime = 'RANGE';
    confidence = Math.min(85, 60 + (100 - dirStrength) * 0.3);
    reason = 'No strong directional edge detected';
    characteristics.push('Low directional momentum');
    characteristics.push('Price likely range-bound');
    if (ivRank > 50) {
      characteristics.push('Elevated IV favors premium selling');
    }
  }

  return { regime, confidence, reason, characteristics };
}
