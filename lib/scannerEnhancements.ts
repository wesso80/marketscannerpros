/**
 * Scanner Enhancement Functions
 * Cross-TF alignment, volatility squeeze detection, relative strength scoring.
 * These operate on pre-computed candle arrays and indicator values,
 * so they can be used from both the run route and bulk route.
 */

// ─── EMA helper (standalone, no external deps) ──────────────────────────────
function emaCalc(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev: number | undefined;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (i === 0) prev = v;
    const cur = v * k + prev! * (1 - k);
    out.push(cur);
    prev = cur;
  }
  return out;
}

// ─── ATR helper (standalone) ────────────────────────────────────────────────
function atrCalc(highs: number[], lows: number[], closes: number[], period = 14): number[] {
  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const h = highs[i], l = lows[i], pc = closes[i - 1];
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    trs.push(tr);
  }
  const out: number[] = new Array(trs.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < trs.length; i++) {
    sum += trs[i];
    if (i >= period) sum -= trs[i - period];
    out[i] = i + 1 >= period ? sum / period : NaN;
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  1. Cross-TF Alignment via EMA Stack
// ═══════════════════════════════════════════════════════════════════════════════
export interface EMAStackResult {
  /** 0-4 how many EMAs are stacked in directional order */
  score: 0 | 1 | 2 | 3 | 4;
  /** Human-readable label: "Perfect Bull Stack", "Partial", etc. */
  label: string;
  /** Underlying EMA values */
  emaStack: {
    ema20: number;
    ema50: number;
    ema100: number;
    ema200: number;
  };
  /** Directional alignment: 'bullish' | 'bearish' | 'mixed' */
  direction: 'bullish' | 'bearish' | 'mixed';
}

/**
 * Compute cross-timeframe alignment using EMA stacking.
 * A "perfect stack" (price > EMA20 > EMA50 > EMA100 > EMA200)
 * indicates all timeframe trends agree — the institutional gold standard.
 */
export function computeEMAStackAlignment(
  closes: number[],
  price: number
): EMAStackResult {
  if (closes.length < 200 || !Number.isFinite(price)) {
    // Not enough data for EMA200 — fall back to whatever we can compute
    const ema20Arr = closes.length >= 20 ? emaCalc(closes, 20) : [];
    const ema50Arr = closes.length >= 50 ? emaCalc(closes, 50) : [];
    const e20 = ema20Arr.length ? ema20Arr[ema20Arr.length - 1] : NaN;
    const e50 = ema50Arr.length ? ema50Arr[ema50Arr.length - 1] : NaN;
    return {
      score: 0,
      label: 'Insufficient Data',
      emaStack: { ema20: e20, ema50: e50, ema100: NaN, ema200: NaN },
      direction: 'mixed',
    };
  }

  const ema20 = emaCalc(closes, 20);
  const ema50 = emaCalc(closes, 50);
  const ema100 = emaCalc(closes, 100);
  const ema200 = emaCalc(closes, 200);

  const e20 = ema20[ema20.length - 1];
  const e50 = ema50[ema50.length - 1];
  const e100 = ema100[ema100.length - 1];
  const e200 = ema200[ema200.length - 1];

  // Bull stack: price > ema20 > ema50 > ema100 > ema200
  const bullChecks = [
    price > e20,
    e20 > e50,
    e50 > e100,
    e100 > e200,
  ];
  const bullScore = bullChecks.filter(Boolean).length;

  // Bear stack: price < ema20 < ema50 < ema100 < ema200
  const bearChecks = [
    price < e20,
    e20 < e50,
    e50 < e100,
    e100 < e200,
  ];
  const bearScore = bearChecks.filter(Boolean).length;

  const isBull = bullScore >= bearScore;
  const score = Math.max(bullScore, bearScore) as 0 | 1 | 2 | 3 | 4;

  const labels: Record<number, string> = {
    4: isBull ? 'Perfect Bull Stack' : 'Perfect Bear Stack',
    3: isBull ? 'Strong Bull Alignment' : 'Strong Bear Alignment',
    2: 'Partial Alignment',
    1: 'Weak Alignment',
    0: 'No Alignment',
  };

  return {
    score,
    label: labels[score] || 'Unknown',
    emaStack: { ema20: e20, ema50: e50, ema100: e100, ema200: e200 },
    direction: score >= 3 ? (isBull ? 'bullish' : 'bearish') : 'mixed',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  2. Volatility Squeeze Detection (Bollinger inside Keltner)
// ═══════════════════════════════════════════════════════════════════════════════
export interface SqueezeResult {
  /** Whether a squeeze is currently active */
  squeeze: boolean;
  /** 0-100 intensity of the squeeze (how tight BBs are inside KCs) */
  squeezeIntensity: number;
  /** Bollinger Band width as % of mid */
  bbWidthPct: number;
  /** Keltner Channel width as % of mid */
  kcWidthPct: number;
  /** Momentum direction heading into / during squeeze */
  momentumDirection: 'bullish' | 'bearish' | 'neutral';
  /** Number of consecutive squeeze bars (how long the squeeze has been on) */
  squeezeBars: number;
}

/**
 * Detect a volatility squeeze: Bollinger Bands contracting inside Keltner Channels.
 * This signals a pending breakout — the tighter the squeeze, the more explosive.
 */
export function detectVolatilitySqueeze(
  closes: number[],
  highs: number[],
  lows: number[],
  period = 20,
  bbMult = 2.0,
  kcMult = 1.5
): SqueezeResult {
  const n = closes.length;
  const fallback: SqueezeResult = {
    squeeze: false,
    squeezeIntensity: 0,
    bbWidthPct: 0,
    kcWidthPct: 0,
    momentumDirection: 'neutral',
    squeezeBars: 0,
  };

  if (n < period + 14) return fallback; // need enough data for both BB and KC

  // --- Bollinger Bands ---
  const smaSlice = closes.slice(-period);
  const sma = smaSlice.reduce((a, b) => a + b, 0) / period;
  const variance = smaSlice.reduce((a, v) => a + (v - sma) ** 2, 0) / period;
  const stddev = Math.sqrt(variance);
  const bbUpper = sma + bbMult * stddev;
  const bbLower = sma - bbMult * stddev;
  const bbWidth = bbUpper - bbLower;

  // --- Keltner Channels ---
  const ema20 = emaCalc(closes, period);
  const ema20Val = ema20[ema20.length - 1];
  const atrArr = atrCalc(highs, lows, closes, period);
  const atrVal = atrArr[atrArr.length - 1];

  if (!Number.isFinite(ema20Val) || !Number.isFinite(atrVal) || atrVal <= 0) return fallback;

  const kcUpper = ema20Val + kcMult * atrVal;
  const kcLower = ema20Val - kcMult * atrVal;
  const kcWidth = kcUpper - kcLower;

  // Squeeze = BB inside KC
  const isSqueezing = bbUpper < kcUpper && bbLower > kcLower;

  // Compute squeeze intensity: how much of the KC width the BBs fill (lower = tighter)
  const fillRatio = kcWidth > 0 ? bbWidth / kcWidth : 1;
  const squeezeIntensity = isSqueezing
    ? Math.round(Math.max(0, Math.min(100, (1 - fillRatio) * 100)))
    : 0;

  // Count consecutive squeeze bars (look back)
  let squeezeBars = 0;
  if (isSqueezing) {
    // Check previous bars by running rolling BB/KC
    for (let offset = 0; offset < Math.min(50, n - period - 14); offset++) {
      const endIdx = n - offset;
      const startIdx = endIdx - period;
      if (startIdx < 0) break;

      const sliceCloses = closes.slice(startIdx, endIdx);
      const sliceSma = sliceCloses.reduce((a, b) => a + b, 0) / period;
      const sliceVar = sliceCloses.reduce((a, v) => a + (v - sliceSma) ** 2, 0) / period;
      const sliceStd = Math.sqrt(sliceVar);
      const bbu = sliceSma + bbMult * sliceStd;
      const bbl = sliceSma - bbMult * sliceStd;

      const emaVal = ema20[endIdx - 1]; // ema20 is same length as closes
      const atrV = atrArr[endIdx - 2]; // atr array is length-1
      if (!Number.isFinite(emaVal) || !Number.isFinite(atrV)) break;

      const kcu = emaVal + kcMult * atrV;
      const kcl = emaVal - kcMult * atrV;

      if (bbu < kcu && bbl > kcl) {
        squeezeBars++;
      } else {
        break;
      }
    }
  }

  // Momentum direction: is the linear momentum (close - close[n-period]) positive?
  const momentumDelta = closes[n - 1] - closes[n - period];
  const momentumDirection: 'bullish' | 'bearish' | 'neutral' =
    momentumDelta > 0.001 * closes[n - 1]
      ? 'bullish'
      : momentumDelta < -0.001 * closes[n - 1]
        ? 'bearish'
        : 'neutral';

  const bbWidthPct = sma > 0 ? (bbWidth / sma) * 100 : 0;
  const kcWidthPct = ema20Val > 0 ? (kcWidth / ema20Val) * 100 : 0;

  return {
    squeeze: isSqueezing,
    squeezeIntensity,
    bbWidthPct: Math.round(bbWidthPct * 100) / 100,
    kcWidthPct: Math.round(kcWidthPct * 100) / 100,
    momentumDirection,
    squeezeBars,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  3. Relative Strength vs Benchmark
// ═══════════════════════════════════════════════════════════════════════════════
export interface RelativeStrengthResult {
  /** RS ratio: > 1 = outperforming, < 1 = underperforming, null if benchmark missing */
  rs: number | null;
  /** Human label */
  label: string;
  /** Benchmark used */
  benchmark: string;
  /** Symbol's change (%) */
  symbolChangePct: number;
  /** Benchmark's change (%) */
  benchmarkChangePct: number;
}

/**
 * Compute relative strength of a symbol vs its benchmark.
 * For crypto: compare vs BTC. For equities: compare vs SPY / market average.
 */
export function computeRelativeStrength(
  symbolChangePct: number,
  benchmarkChangePct: number,
  benchmarkName: string
): RelativeStrengthResult {
  if (
    !Number.isFinite(symbolChangePct) ||
    !Number.isFinite(benchmarkChangePct)
  ) {
    return {
      rs: null,
      label: 'N/A',
      benchmark: benchmarkName,
      symbolChangePct: symbolChangePct || 0,
      benchmarkChangePct: benchmarkChangePct || 0,
    };
  }

  // RS ratio: (1 + symbolChange%) / (1 + benchmarkChange%)
  const denominator = 1 + benchmarkChangePct / 100;
  const numerator = 1 + symbolChangePct / 100;
  const rs = denominator !== 0 ? numerator / denominator : null;

  let label: string;
  if (rs === null) {
    label = 'N/A';
  } else if (rs >= 1.15) {
    label = 'Strong Outperformer';
  } else if (rs >= 1.03) {
    label = 'Outperformer';
  } else if (rs >= 0.97) {
    label = 'In-line';
  } else if (rs >= 0.85) {
    label = 'Underperformer';
  } else {
    label = 'Strong Underperformer';
  }

  return {
    rs: rs !== null ? Math.round(rs * 1000) / 1000 : null,
    label,
    benchmark: benchmarkName,
    symbolChangePct,
    benchmarkChangePct,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  4. All-in-one enhancement — call from scan route
// ═══════════════════════════════════════════════════════════════════════════════
export interface ScanEnhancements {
  emaStack: EMAStackResult;
  squeeze: SqueezeResult;
  relativeStrength: RelativeStrengthResult;
}

/**
 * Compute all scanner enhancements for a single symbol.
 * Designed to be called once per scan result with existing candle + indicator data.
 */
export function computeScanEnhancements(opts: {
  closes: number[];
  highs: number[];
  lows: number[];
  price: number;
  changePct: number;         // Symbol's recent change %
  benchmarkChangePct: number; // Benchmark's change %
  benchmarkName: string;      // 'BTC' or 'SPY'
}): ScanEnhancements {
  const { closes, highs, lows, price, changePct, benchmarkChangePct, benchmarkName } = opts;

  const emaStack = computeEMAStackAlignment(closes, price);
  const squeeze = detectVolatilitySqueeze(closes, highs, lows);
  const relativeStrength = computeRelativeStrength(changePct, benchmarkChangePct, benchmarkName);

  return { emaStack, squeeze, relativeStrength };
}
