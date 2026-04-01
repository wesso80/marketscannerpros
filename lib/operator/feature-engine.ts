/**
 * MSP Operator — Feature Engine §6.2
 * Converts normalized bars + context into reusable feature vectors.
 * Wired into existing MSP indicator libraries for real computations.
 * @internal
 */

import type {
  Bar, FeatureVector, FeatureComputeRequest, Market, CrossMarketState, EventWindow, KeyLevel,
} from '@/types/operator';
import type { OHLCVBar } from '@/lib/indicators';
import {
  ema, emaSeries, rsi, macd, atr, adx,
  bollingerBands, bbWidthPercent, detectSqueeze, detectMomentumAcceleration,
} from '@/lib/indicators';
import { computeEMAStackAlignment, detectVolatilitySqueeze } from '@/lib/scannerEnhancements';
import { clamp, nowISO } from './shared';
import { ENGINE_VERSIONS } from './version-registry';

/* ── Bar adapter ────────────────────────────────────────────── */

function toOHLCVBars(bars: Bar[]): OHLCVBar[] {
  return bars.map(b => ({
    timestamp: b.timestamp,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
  }));
}

/* ── Real feature computations ──────────────────────────────── */

export function computeFeatureVector(req: FeatureComputeRequest): FeatureVector {
  const { symbol, market, timeframe, bars, keyLevels, crossMarketSnapshot, eventSnapshot } = req;
  const ohlcv = toOHLCVBars(bars);
  const closes = bars.map(b => b.close);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);

  const features = {
    trendScore: computeTrendScore(ohlcv, closes),
    emaAlignmentScore: computeEmaAlignment(closes, bars[bars.length - 1]?.close ?? 0),
    atrPercentile: computeAtrPercentile(ohlcv),
    bbwpPercentile: computeBbwpPercentile(closes),
    volExpansionScore: computeVolExpansion(ohlcv, closes, highs, lows),
    momentumScore: computeMomentum(ohlcv, closes),
    extensionScore: computeExtension(closes),
    structureScore: computeStructure(bars, keyLevels),
    timeConfluenceScore: computeTimeConfluence(),
    liquidityScore: computeLiquidity(bars),
    relativeVolumeScore: computeRelativeVolume(bars),
    eventRiskScore: computeEventRisk(eventSnapshot),
    crossMarketScore: computeCrossMarket(crossMarketSnapshot),
    optionsFlowScore: null as number | null,
    symbolTrustScore: null as number | null,
    playbookHealthScore: null as number | null,
  };

  return {
    symbol,
    market,
    timeframe,
    timestamp: nowISO(),
    schemaVersion: '2.0.0',
    engineVersion: ENGINE_VERSIONS.featureEngineVersion,
    features,
  };
}

/* ── Individual feature implementations ─────────────────────── */

/**
 * Trend score using ADX + EMA slope direction.
 * ADX > 25 with aligned EMAs → strong trend → high score.
 */
function computeTrendScore(ohlcv: OHLCVBar[], closes: number[]): number {
  if (closes.length < 50) return 0.5;

  const adxResult = adx(ohlcv, 14);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const price = closes[closes.length - 1];

  let score = 0.5;

  // ADX component (0-1): ADX 0-50+ mapped to 0-1
  if (adxResult) {
    score = clamp(adxResult.adx / 50, 0, 0.6);
  }

  // Directional alignment bonus
  if (ema20 !== null && ema50 !== null) {
    if (price > ema20 && ema20 > ema50) score += 0.25; // Bullish alignment
    else if (price < ema20 && ema20 < ema50) score += 0.25; // Bearish alignment (trending)
    else score += 0.05; // Mixed
  }

  // Momentum direction from ADX DI
  if (adxResult && adxResult.plusDI > adxResult.minusDI && price > (ema20 ?? 0)) {
    score += 0.15;
  } else if (adxResult && adxResult.minusDI > adxResult.plusDI && price < (ema20 ?? 0)) {
    score += 0.15;
  }

  return clamp(score, 0, 1);
}

/**
 * EMA alignment using the MSP EMA stack (8/21/50/200).
 * Uses computeEMAStackAlignment from scannerEnhancements.
 */
function computeEmaAlignment(closes: number[], currentPrice: number): number {
  if (closes.length < 200) {
    // Fallback: basic alignment check with available data
    if (closes.length < 21) return 0.5;
    const ema8 = ema(closes, 8);
    const ema21 = ema(closes, 21);
    if (ema8 === null || ema21 === null) return 0.5;
    // Aligned = price > ema8 > ema21 or price < ema8 < ema21
    if ((currentPrice > ema8 && ema8 > ema21) || (currentPrice < ema8 && ema8 < ema21)) return 0.8;
    return 0.4;
  }
  const result = computeEMAStackAlignment(closes, currentPrice);
  // score 0-4 → normalize to 0-1
  return clamp(result.score / 4, 0, 1);
}

/**
 * ATR percentile: where current ATR sits in its own 100-bar history.
 * High percentile = volatile conditions.
 */
function computeAtrPercentile(ohlcv: OHLCVBar[]): number {
  if (ohlcv.length < 30) return 0.5;
  const lookback = Math.min(100, ohlcv.length - 14);
  const atrValues: number[] = [];

  for (let i = 14; i <= 14 + lookback; i++) {
    const slice = ohlcv.slice(0, i);
    const val = atr(slice, 14);
    if (val !== null) atrValues.push(val);
  }

  if (atrValues.length < 10) return 0.5;
  const current = atrValues[atrValues.length - 1];
  const rank = atrValues.filter(v => v <= current).length;
  return clamp(rank / atrValues.length, 0, 1);
}

/**
 * BBWP: Bollinger Band Width Percentile.
 * Uses bbWidthPercent over a rolling window.
 */
function computeBbwpPercentile(closes: number[]): number {
  if (closes.length < 40) return 0.5;
  const lookback = Math.min(100, closes.length - 20);
  const widths: number[] = [];

  for (let i = 20; i <= 20 + lookback; i++) {
    const slice = closes.slice(0, i);
    const w = bbWidthPercent(slice, 20, 2);
    if (w !== null) widths.push(w);
  }

  if (widths.length < 10) return 0.5;
  const current = widths[widths.length - 1];
  const rank = widths.filter(v => v <= current).length;
  return clamp(rank / widths.length, 0, 1);
}

/**
 * Volatility expansion: is volatility expanding?
 * Uses squeeze detection + band width rate of change.
 */
function computeVolExpansion(
  ohlcv: OHLCVBar[],
  closes: number[],
  highs: number[],
  lows: number[],
): number {
  const squeeze = detectSqueeze(ohlcv);
  const squeezeAlt = detectVolatilitySqueeze(closes, highs, lows);

  let score = 0.5;

  // Squeeze means compression → expansion is imminent but not happening yet
  if (squeeze?.inSqueeze) {
    score = 0.3; // Low expansion during squeeze
  } else if (squeeze && !squeeze.inSqueeze) {
    // Not in squeeze → check if we just broke out
    const bbw = bbWidthPercent(closes, 20, 2);
    if (bbw !== null && bbw > 5) score = 0.7;
    if (bbw !== null && bbw > 8) score = 0.85;
  }

  // ATR expansion rate
  if (ohlcv.length > 30) {
    const atr5 = atr(ohlcv.slice(-19), 14);
    const atr20 = atr(ohlcv.slice(-34), 14);
    if (atr5 !== null && atr20 !== null && atr20 > 0) {
      const ratio = atr5 / atr20;
      if (ratio > 1.3) score = Math.max(score, 0.8);
      else if (ratio > 1.1) score = Math.max(score, 0.6);
    }
  }

  return clamp(score, 0, 1);
}

/**
 * Momentum: RSI + MACD histogram + momentum acceleration.
 */
function computeMomentum(ohlcv: OHLCVBar[], closes: number[]): number {
  let score = 0.5;

  // RSI component (50 = neutral, 70+ = strong bullish momentum, 30- = strong bearish)
  const rsiVal = rsi(closes, 14);
  if (rsiVal !== null) {
    // Distance from 50 normalized: 0 at RSI 50, 1 at RSI 70 or 30
    score = clamp(Math.abs(rsiVal - 50) / 25, 0, 0.5);
  }

  // MACD component
  const macdResult = macd(closes);
  if (macdResult && macdResult.histogram !== null) {
    const histStrength = Math.abs(macdResult.histogram);
    const avgClose = closes[closes.length - 1] || 1;
    score += clamp((histStrength / avgClose) * 100, 0, 0.3);
  }

  // Momentum acceleration from MSP library
  const accel = detectMomentumAcceleration(ohlcv);
  if (accel?.accelerating) {
    score += 0.2;
  }

  return clamp(score, 0, 1);
}

/**
 * Extension: how far price is from key EMAs.
 * Overextended = high score (risk of reversion).
 */
function computeExtension(closes: number[]): number {
  if (closes.length < 21) return 0.5;
  const price = closes[closes.length - 1];
  const ema21val = ema(closes, 21);
  if (ema21val === null || ema21val === 0) return 0.5;

  const distPct = Math.abs(price - ema21val) / ema21val;
  // 0% → 0 extension, 5%+ → high extension
  return clamp(distPct / 0.05, 0, 1);
}

/**
 * Structure: proximity to key levels + recent structure quality.
 */
function computeStructure(bars: Bar[], keyLevels: KeyLevel[]): number {
  if (bars.length < 5 || keyLevels.length === 0) return 0.3;
  const price = bars[bars.length - 1].close;
  const atrProxy = bars.slice(-14).reduce((s, b) => s + (b.high - b.low), 0) / Math.min(14, bars.length);

  if (atrProxy <= 0) return 0.3;

  let bestProximity = Infinity;
  let bestStrength = 0;

  for (const level of keyLevels) {
    const dist = Math.abs(price - level.price) / atrProxy;
    if (dist < bestProximity) {
      bestProximity = dist;
      bestStrength = level.strength ?? 0.5;
    }
  }

  // Close to a strong level = good structure
  const proximityScore = clamp(1 - bestProximity / 3, 0, 1);
  return clamp(proximityScore * bestStrength * 1.5, 0, 1);
}

/**
 * Time confluence: is current time in a favorable session window?
 */
function computeTimeConfluence(): number {
  const now = new Date();
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  const totalMin = hour * 60 + minute;

  // RTH open 13:30-14:30 UTC (9:30-10:30 ET) → highest confluence
  if (totalMin >= 810 && totalMin <= 870) return 0.9;
  // Morning session 14:30-16:00 UTC (10:30-12:00 ET) → good
  if (totalMin >= 870 && totalMin <= 960) return 0.75;
  // Power hour 19:00-20:00 UTC (3:00-4:00 PM ET)
  if (totalMin >= 1140 && totalMin <= 1200) return 0.8;
  // Midday lull 16:00-19:00 UTC
  if (totalMin >= 960 && totalMin <= 1140) return 0.4;
  // Pre/post market
  if (totalMin >= 780 && totalMin < 810) return 0.5;
  // Overnight
  return 0.3;
}

/**
 * Liquidity: volume consistency and depth proxy.
 */
function computeLiquidity(bars: Bar[]): number {
  if (bars.length < 10) return 0.5;
  const recent = bars.slice(-20);
  const volumes = recent.map(b => b.volume);
  const avgVol = volumes.reduce((s, v) => s + v, 0) / volumes.length;
  if (avgVol <= 0) return 0.2;

  // Coefficient of variation of volume (low = stable liquidity)
  const variance = volumes.reduce((s, v) => s + Math.pow(v - avgVol, 2), 0) / volumes.length;
  const cv = Math.sqrt(variance) / avgVol;

  // Also check absolute volume (>100k shares/day = good for equities)
  const volScore = clamp(avgVol / 500000, 0, 0.5);
  const stabilityScore = clamp(1 - cv, 0, 0.5);

  return clamp(volScore + stabilityScore, 0, 1);
}

/**
 * Relative volume: current bar volume vs same-period average.
 */
function computeRelativeVolume(bars: Bar[]): number {
  if (bars.length < 10) return 0.5;
  const current = bars[bars.length - 1].volume;
  const avg = bars.slice(0, -1).reduce((s, b) => s + b.volume, 0) / (bars.length - 1);
  if (avg <= 0) return 0.5;
  const rvol = current / avg;
  // RVOL 1.0 = average → 0.5; 2.0+ = very high → ~0.85; 3.0+ → 1.0
  return clamp(rvol / 3, 0, 1);
}

/**
 * Event risk: high score = safe (no event risk).
 */
function computeEventRisk(event: EventWindow): number {
  if (event.isActive) {
    if (event.severity === 'high') return 0.1;
    if (event.severity === 'medium') return 0.3;
    return 0.5;
  }
  return 0.9;
}

/**
 * Cross-market alignment score.
 */
function computeCrossMarket(cross: CrossMarketState): number {
  let score = 0.5;
  // VIX
  if (cross.vixState === 'normal') score += 0.2;
  else if (cross.vixState === 'cautious') score += 0.05;
  else if (cross.vixState === 'elevated') score -= 0.15;
  // Breadth
  if (cross.breadthState === 'bullish') score += 0.15;
  else if (cross.breadthState === 'bearish') score -= 0.1;
  // DXY
  if (cross.dxyState === 'neutral') score += 0.1;
  else if (cross.dxyState === 'rising') score -= 0.05;
  return clamp(score, 0, 1);
}

export function createFeatureResponse(fv: FeatureVector) {
  return makeEnvelope('feature-engine', { featureVector: fv });
}

// Re-export for backward compatibility
import { makeEnvelope } from './shared';

