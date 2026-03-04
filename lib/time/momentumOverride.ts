/**
 * Momentum Override Module
 *
 * Prevents the Time Gravity / midpoint engine from acting like a
 * mean-reversion bot when the market is clearly in impulse expansion.
 *
 * Rule: "When momentum is strong enough, magnets don't lead — liquidity does."
 *
 * Detection uses 2-of-3 objective conditions:
 *   A) Range expansion spike  (rangeZ >= 1.8)
 *   B) Trend velocity vs ATR  (vel   >= 1.2)
 *   C) Break + hold past prior swing
 *
 * When override is active the gravity engine:
 *   - Dampens midpoint gravity by `gravityMultiplier` (default 0.25)
 *   - Switches target mode to EXPANSION (next liquidity / range extension)
 *   - Keeps midpoints visible but labelled LOW PRIORITY
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface MomentumOverrideInput {
  /** Oldest → newest close prices (min 6 bars) */
  closes: number[];
  /** Oldest → newest highs */
  highs: number[];
  /** Oldest → newest lows */
  lows: number[];

  /** Pre-computed ATR(14) for this timeframe */
  atr14: number;
  /** Average(high - low) over N bars (e.g. N = 20) */
  avgRangeN: number;

  /** Optional prior swing references */
  priorSwingHigh?: number;
  priorSwingLow?: number;
}

export interface MomentumOverrideState {
  /** Whether the override is triggered (2+ conditions met) */
  isOverride: boolean;
  /** Human-readable reasons: "range_spike(2.1x)", "velocity(1.4 ATR)", "break_hold" */
  reasons: string[];
  /** Normalized severity 0 → 1 */
  severity01: number;
  /** Individual condition flags (for UI) */
  conditions: {
    rangeSpike: boolean;
    velocity: boolean;
    breakHold: boolean;
  };
  /** Raw metric values (for debugging / display) */
  metrics: {
    rangeZ: number;
    velocity: number;
    pullbackDepth: number | null;
  };
  /** Gravity dampening multiplier (0.25 when override, 1.0 when off) */
  gravityMultiplier: number;
  /** Suggested mode string for the UI */
  mode: 'MAGNET' | 'EXPANSION';
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * Compute ATR(period) from high/low/close arrays.
 * Falls back to 0 if insufficient data.
 */
export function computeATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14
): number {
  const n = highs.length;
  if (n < 2) return 0;

  let trSum = 0;
  const count = Math.min(period, n - 1);

  for (let i = n - count; i < n; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trSum += tr;
  }

  return count > 0 ? trSum / count : 0;
}

/**
 * Compute average bar range over the last N bars.
 */
export function computeAvgRange(
  highs: number[],
  lows: number[],
  period: number = 20
): number {
  const n = highs.length;
  const count = Math.min(period, n);
  if (count === 0) return 0;

  let sum = 0;
  for (let i = n - count; i < n; i++) {
    sum += Math.max(0, highs[i] - lows[i]);
  }
  return sum / count;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Determine whether momentum override should activate.
 *
 * Requires at least 6 bars of history (`closes`, `highs`, `lows` arrays).
 * If fewer bars are provided the override is off.
 */
export function computeMomentumOverride(
  input: MomentumOverrideInput
): MomentumOverrideState {
  const {
    closes,
    highs,
    lows,
    atr14,
    avgRangeN,
    priorSwingHigh,
    priorSwingLow,
  } = input;

  const n = closes.length;

  // Not enough history — can't evaluate
  if (n < 6) {
    return {
      isOverride: false,
      reasons: ['insufficient_history'],
      severity01: 0,
      conditions: { rangeSpike: false, velocity: false, breakHold: false },
      metrics: { rangeZ: 0, velocity: 0, pullbackDepth: null },
      gravityMultiplier: 1.0,
      mode: 'MAGNET',
    };
  }

  const hi = highs[n - 1];
  const lo = lows[n - 1];
  const cl = closes[n - 1];
  const currentRange = Math.max(0, hi - lo);

  // ─────────────────────────────────────────────────────────────────────
  // A) Range Expansion Spike
  // ─────────────────────────────────────────────────────────────────────
  const rangeZ = avgRangeN > 0 ? currentRange / avgRangeN : 0;
  const rangeHit = rangeZ >= 1.8;

  // ─────────────────────────────────────────────────────────────────────
  // B) Velocity vs ATR
  // ─────────────────────────────────────────────────────────────────────
  const cl5 = closes[n - 6]; // 5 bars ago
  const vel = atr14 > 0 ? Math.abs(cl - cl5) / atr14 : 0;
  const velHit = vel >= 1.2;

  // ─────────────────────────────────────────────────────────────────────
  // C) Break + Hold (optional — only checked when swing refs provided)
  // ─────────────────────────────────────────────────────────────────────
  let breakHoldHit = false;
  let pullbackDepth: number | null = null;

  if (typeof priorSwingHigh === 'number') {
    // Bullish breakout: close above prior swing high, holds in upper 38%
    const pd = hi > lo ? (hi - cl) / (hi - lo) : 1; // 0 = close at high
    if (cl > priorSwingHigh && pd <= 0.62) {
      breakHoldHit = true;
      pullbackDepth = pd;
    }
  }
  if (typeof priorSwingLow === 'number' && !breakHoldHit) {
    // Bearish breakout: close below prior swing low, holds in lower 38%
    const pd = hi > lo ? (cl - lo) / (hi - lo) : 1; // 0 = close at low
    if (cl < priorSwingLow && pd <= 0.62) {
      breakHoldHit = true;
      pullbackDepth = pd;
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Aggregate — need 2 of 3
  // ─────────────────────────────────────────────────────────────────────
  const hits = [rangeHit, velHit, breakHoldHit].filter(Boolean).length;
  const isOverride = hits >= 2;

  const reasons: string[] = [];
  if (rangeHit) reasons.push(`range_spike(${rangeZ.toFixed(2)}x)`);
  if (velHit) reasons.push(`velocity(${vel.toFixed(2)} ATR)`);
  if (breakHoldHit) reasons.push('break_hold');

  // Severity: combine normalised measures into 0..1
  const sRange = clamp01((rangeZ - 1.2) / (2.6 - 1.2)); // maps 1.2‥2.6 → 0‥1
  const sVel = clamp01((vel - 0.7) / (1.8 - 0.7));       // maps 0.7‥1.8 → 0‥1
  const severity01 = clamp01(
    (sRange + sVel + (breakHoldHit ? 0.5 : 0)) / 2.5
  );

  return {
    isOverride,
    reasons,
    severity01,
    conditions: {
      rangeSpike: rangeHit,
      velocity: velHit,
      breakHold: breakHoldHit,
    },
    metrics: {
      rangeZ,
      velocity: vel,
      pullbackDepth,
    },
    gravityMultiplier: isOverride ? 0.25 : 1.0,
    mode: isOverride ? 'EXPANSION' : 'MAGNET',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXTENSION-TARGET HELPERS
// ═══════════════════════════════════════════════════════════════════════════

export interface ExpansionTarget {
  price: number;
  label: string;
  type: 'extension' | 'liquidity';
}

/**
 * Compute Fibonacci-style expansion targets from the most recent impulse.
 *
 * @param impulseStart  Start of impulse (swing low for bull, swing high for bear)
 * @param impulseEnd    End of impulse (current high for bull, current low for bear)
 */
export function computeExpansionTargets(
  impulseStart: number,
  impulseEnd: number
): ExpansionTarget[] {
  const range = Math.abs(impulseEnd - impulseStart);
  const isBull = impulseEnd > impulseStart;
  const base = impulseEnd;

  const extensions = [1.272, 1.618, 2.0, 2.618];

  return extensions.map(ext => {
    const price = isBull
      ? base + range * (ext - 1)
      : base - range * (ext - 1);
    return {
      price: Math.round(price * 100) / 100,
      label: `${ext}× ext`,
      type: 'extension' as const,
    };
  });
}

/**
 * Simple liquidity-target generator from reference levels.
 *
 * @param levels  Array of labeled price levels (e.g. prior day high, weekly high)
 * @param currentPrice  Current market price
 * @param direction     'up' or 'down'
 */
export function getLiquidityTargets(
  levels: { price: number; label: string }[],
  currentPrice: number,
  direction: 'up' | 'down'
): ExpansionTarget[] {
  return levels
    .filter(l =>
      direction === 'up' ? l.price > currentPrice : l.price < currentPrice
    )
    .sort((a, b) =>
      direction === 'up' ? a.price - b.price : b.price - a.price
    )
    .slice(0, 3)
    .map(l => ({ ...l, type: 'liquidity' as const }));
}
