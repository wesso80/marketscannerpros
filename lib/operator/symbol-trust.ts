/**
 * MSP Operator — Symbol Trust Model §13.3
 * Computes a composite trust score for each symbol based on:
 *   - false break frequency
 *   - slippage quality
 *   - follow-through behavior
 *   - spread stability
 *   - session reliability
 *   - event sensitivity
 * @internal
 */

import type { SymbolTrustProfile, Market, Bar } from '@/types/operator';
import { clamp, nowISO } from './shared';

/* ── Individual trust dimensions ────────────────────────────── */

/**
 * False break rate: how often does price break a key level then reverse?
 * Lower rate = higher trust. Returns 0–1 (1 = very trustworthy, no false breaks).
 */
function computeFalseBreakRate(bars: Bar[]): number {
  if (bars.length < 20) return 0.5;
  const lookback = bars.slice(-60);
  let breakouts = 0;
  let falseBreaks = 0;

  for (let i = 5; i < lookback.length; i++) {
    const prior5High = Math.max(...lookback.slice(i - 5, i).map(b => b.high));
    const prior5Low = Math.min(...lookback.slice(i - 5, i).map(b => b.low));
    const bar = lookback[i];

    // Break above prior 5-bar high
    if (bar.high > prior5High) {
      breakouts++;
      // Check if it reversed within next 3 bars
      const next3 = lookback.slice(i + 1, i + 4);
      if (next3.some(b => b.close < prior5High)) falseBreaks++;
    }
    // Break below prior 5-bar low
    if (bar.low < prior5Low) {
      breakouts++;
      const next3 = lookback.slice(i + 1, i + 4);
      if (next3.some(b => b.close > prior5Low)) falseBreaks++;
    }
  }

  if (breakouts === 0) return 0.5;
  const rate = falseBreaks / breakouts;
  return clamp(1 - rate, 0, 1);
}

/**
 * Slippage quality: how tight are the wicks relative to body?
 * Tight wicks = cleaner fills = higher trust.
 */
function computeSlippageQuality(bars: Bar[]): number {
  if (bars.length < 10) return 0.5;
  const recent = bars.slice(-30);
  let totalWickRatio = 0;

  for (const bar of recent) {
    const range = bar.high - bar.low;
    if (range <= 0) continue;
    const body = Math.abs(bar.close - bar.open);
    totalWickRatio += body / range;
  }

  return clamp(totalWickRatio / recent.length, 0, 1);
}

/**
 * Follow-through: when price moves in a direction, does it continue?
 * Higher follow-through = higher trust for trend/breakout playbooks.
 */
function computeFollowThrough(bars: Bar[]): number {
  if (bars.length < 10) return 0.5;
  const recent = bars.slice(-40);
  let follows = 0;
  let moves = 0;

  for (let i = 1; i < recent.length - 1; i++) {
    const prev = recent[i - 1];
    const curr = recent[i];
    const next = recent[i + 1];
    const prevDir = curr.close - prev.close;
    const nextDir = next.close - curr.close;
    if (Math.abs(prevDir) > 0) {
      moves++;
      if (Math.sign(prevDir) === Math.sign(nextDir)) follows++;
    }
  }

  return moves > 0 ? clamp(follows / moves, 0, 1) : 0.5;
}

/**
 * Spread stability: how consistent is the bar range over time?
 * Low variance in range = stable spreads = higher trust.
 */
function computeSpreadStability(bars: Bar[]): number {
  if (bars.length < 10) return 0.5;
  const ranges = bars.slice(-30).map(b => b.high - b.low).filter(r => r > 0);
  if (ranges.length < 5) return 0.5;
  const mean = ranges.reduce((s, r) => s + r, 0) / ranges.length;
  const variance = ranges.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / ranges.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
  // Low CV = stable → high score
  return clamp(1 - cv, 0, 1);
}

/**
 * Session reliability: does volume concentrate in expected sessions?
 * Higher concentration = more predictable behavior.
 */
function computeSessionReliability(bars: Bar[]): number {
  if (bars.length < 10) return 0.5;
  const recent = bars.slice(-30);
  const avgVol = recent.reduce((s, b) => s + b.volume, 0) / recent.length;
  if (avgVol <= 0) return 0.5;

  // Bars with volume > 0.5x average are "active" sessions
  const active = recent.filter(b => b.volume > avgVol * 0.5).length;
  return clamp(active / recent.length, 0, 1);
}

/**
 * Event sensitivity: how much does price deviate on high-vol bars?
 * Lower sensitivity = higher trust (more predictable).
 */
function computeEventSensitivity(bars: Bar[]): number {
  if (bars.length < 10) return 0.5;
  const recent = bars.slice(-30);
  const avgVol = recent.reduce((s, b) => s + b.volume, 0) / recent.length;
  const avgRange = recent.reduce((s, b) => s + (b.high - b.low), 0) / recent.length;
  if (avgVol <= 0 || avgRange <= 0) return 0.5;

  // High-volume bars
  const highVolBars = recent.filter(b => b.volume > avgVol * 2);
  if (highVolBars.length === 0) return 0.8; // No vol spikes = low sensitivity

  const avgHighVolRange = highVolBars.reduce((s, b) => s + (b.high - b.low), 0) / highVolBars.length;
  const sensitivity = avgHighVolRange / avgRange;
  // If high-vol bars have 3x range → very event-sensitive → low trust
  return clamp(1 - (sensitivity - 1) / 3, 0, 1);
}

/* ── Composite Trust ────────────────────────────────────────── */

const TRUST_WEIGHTS = {
  falseBreakRate: 0.20,
  slippageQuality: 0.15,
  followThroughRate: 0.20,
  spreadStability: 0.15,
  sessionReliability: 0.15,
  eventSensitivity: 0.15,
};

export function computeSymbolTrust(
  symbol: string,
  market: Market,
  bars: Bar[],
): SymbolTrustProfile {
  const falseBreakRate = computeFalseBreakRate(bars);
  const slippageQuality = computeSlippageQuality(bars);
  const followThroughRate = computeFollowThrough(bars);
  const spreadStability = computeSpreadStability(bars);
  const sessionReliability = computeSessionReliability(bars);
  const eventSensitivity = computeEventSensitivity(bars);

  const compositeTrust = clamp(
    TRUST_WEIGHTS.falseBreakRate * falseBreakRate +
    TRUST_WEIGHTS.slippageQuality * slippageQuality +
    TRUST_WEIGHTS.followThroughRate * followThroughRate +
    TRUST_WEIGHTS.spreadStability * spreadStability +
    TRUST_WEIGHTS.sessionReliability * sessionReliability +
    TRUST_WEIGHTS.eventSensitivity * eventSensitivity,
    0, 1,
  );

  return {
    symbol,
    market,
    lastUpdated: nowISO(),
    sampleSize: bars.length,
    falseBreakRate,
    slippageQuality,
    followThroughRate,
    spreadStability,
    sessionReliability,
    eventSensitivity,
    compositeTrust,
  };
}
