export type PatternBias = 'bullish' | 'bearish' | 'neutral';

export interface Candle {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface KeyLine {
  name: string;
  level: number;
  reason: string;
}

export interface DetectedPattern {
  name: string;
  bias: PatternBias;
  confidence: number;
  reason: string;
  keyLines?: KeyLine[];
}

export interface PatternScanResult {
  patterns: DetectedPattern[];
  keyLines: KeyLine[];
  summary: {
    bias: PatternBias;
    confidence: number;
    reason: string;
  };
}

export function scanPatterns(args: {
  candles: Candle[];
  timeframeLabel: string;
  lookback?: number;
}): PatternScanResult {
  const lookback = Math.max(50, Math.min(300, args.lookback ?? 120));
  const candles = (args.candles ?? []).slice(-lookback).filter(isValidCandle);
  if (candles.length < 50) {
    return {
      patterns: [],
      keyLines: [],
      summary: { bias: 'neutral', confidence: 20, reason: 'Not enough candle data for patterns' },
    };
  }

  const patterns: DetectedPattern[] = [];
  const keyLines: KeyLine[] = [];

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const atr = calcATR(candles, 14);
  const range = calcRangeHighLow(candles, 30);
  const { pivotsHigh, pivotsLow } = findPivots(candles, 3);

  keyLines.push({ name: 'range_high', level: range.high, reason: `30-candle range high (${args.timeframeLabel})` });
  keyLines.push({ name: 'range_low', level: range.low, reason: `30-candle range low (${args.timeframeLabel})` });

  const breakout = detectBreakout(candles, range, atr, args.timeframeLabel);
  if (breakout) patterns.push(breakout);

  const sweep = detectLiquiditySweep(last, prev, range, atr, args.timeframeLabel);
  if (sweep) patterns.push(sweep);

  const trend = detectTrendlineState(candles, args.timeframeLabel);
  if (trend) patterns.push(trend);

  const dbl = detectDoubleTopBottom(candles, pivotsHigh, pivotsLow, atr, args.timeframeLabel);
  if (dbl) {
    patterns.push(dbl.pattern);
    if (dbl.keyLines) keyLines.push(...dbl.keyLines);
  }

  const hs = detectHeadAndShoulders(pivotsHigh, pivotsLow, atr, args.timeframeLabel);
  if (hs) {
    patterns.push(hs.pattern);
    if (hs.keyLines) keyLines.push(...hs.keyLines);
  }

  const flag = detectFlag(candles, atr, args.timeframeLabel);
  if (flag) patterns.push(flag);

  const summary = summarize(patterns);

  return {
    patterns: patterns.sort((a, b) => b.confidence - a.confidence).slice(0, 6),
    keyLines: dedupeKeyLines(keyLines),
    summary,
  };
}

function isValidCandle(c: Candle): boolean {
  return !!c && isFiniteNum(c.open) && isFiniteNum(c.high) && isFiniteNum(c.low) && isFiniteNum(c.close)
    && c.high >= c.low && c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close);
}

function isFiniteNum(n: number): boolean {
  return Number.isFinite(n) && !Number.isNaN(n);
}

function calcATR(candles: Candle[], period = 14): number {
  const n = candles.length;
  if (n < period + 2) return (candles[n - 1].high - candles[n - 1].low) || 0.01;
  const trs: number[] = [];
  for (let i = n - period; i < n; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close)
    );
    trs.push(tr);
  }
  const atr = trs.reduce((a, b) => a + b, 0) / trs.length;
  return Math.max(atr, 0.01);
}

function calcRangeHighLow(candles: Candle[], window: number) {
  const slice = candles.slice(-Math.max(20, window));
  let high = -Infinity;
  let low = Infinity;
  for (const c of slice) {
    if (c.high > high) high = c.high;
    if (c.low < low) low = c.low;
  }
  return { high, low };
}

function findPivots(candles: Candle[], leftRight = 3) {
  const pivotsHigh: Array<{ i: number; price: number }> = [];
  const pivotsLow: Array<{ i: number; price: number }> = [];

  for (let i = leftRight; i < candles.length - leftRight; i++) {
    const h = candles[i].high;
    const l = candles[i].low;

    let isHigh = true;
    let isLow = true;

    for (let j = 1; j <= leftRight; j++) {
      if (candles[i - j].high >= h || candles[i + j].high >= h) isHigh = false;
      if (candles[i - j].low <= l || candles[i + j].low <= l) isLow = false;
    }

    if (isHigh) pivotsHigh.push({ i, price: h });
    if (isLow) pivotsLow.push({ i, price: l });
  }

  return { pivotsHigh, pivotsLow };
}

function detectBreakout(candles: Candle[], range: { high: number; low: number }, atr: number, tf: string): DetectedPattern | null {
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const buffer = Math.max(atr * 0.15, last.close * 0.001);

  if (last.close > range.high + buffer && prev.close <= range.high + buffer) {
    const conf = clamp(60 + ((last.close - range.high) / atr) * 10, 60, 90);
    return {
      name: `Breakout (${tf})`,
      bias: 'bullish',
      confidence: conf,
      reason: `Close reclaimed above range high (${range.high.toFixed(2)}) with ATR buffer`,
      keyLines: [{ name: 'breakout_level', level: range.high, reason: 'Range high' }],
    };
  }

  if (last.close < range.low - buffer && prev.close >= range.low - buffer) {
    const conf = clamp(60 + ((range.low - last.close) / atr) * 10, 60, 90);
    return {
      name: `Breakdown (${tf})`,
      bias: 'bearish',
      confidence: conf,
      reason: `Close lost below range low (${range.low.toFixed(2)}) with ATR buffer`,
      keyLines: [{ name: 'breakdown_level', level: range.low, reason: 'Range low' }],
    };
  }

  return null;
}

function detectLiquiditySweep(last: Candle, prev: Candle, range: { high: number; low: number }, atr: number, tf: string): DetectedPattern | null {
  const wickUp = last.high > range.high + atr * 0.1 && last.close < range.high;
  const wickDown = last.low < range.low - atr * 0.1 && last.close > range.low;

  if (wickUp) {
    return {
      name: `Liquidity Sweep High (${tf})`,
      bias: 'bearish',
      confidence: clamp(55 + ((last.high - range.high) / atr) * 12, 55, 88),
      reason: 'Wick ran above range high then closed back inside (stop-run / rejection)',
      keyLines: [{ name: 'swept_high', level: range.high, reason: 'Liquidity above range high' }],
    };
  }
  if (wickDown) {
    return {
      name: `Liquidity Sweep Low (${tf})`,
      bias: 'bullish',
      confidence: clamp(55 + ((range.low - last.low) / atr) * 12, 55, 88),
      reason: 'Wick ran below range low then closed back inside (stop-run / reclaim)',
      keyLines: [{ name: 'swept_low', level: range.low, reason: 'Liquidity below range low' }],
    };
  }
  return null;
}

function detectTrendlineState(candles: Candle[], tf: string): DetectedPattern | null {
  const window = Math.min(60, candles.length);
  const slice = candles.slice(-window);
  const closes = slice.map(c => c.close);
  const slope = linearRegressionSlope(closes);

  const avg = closes.reduce((a, b) => a + b, 0) / closes.length;
  const slopePctPerBar = (slope / Math.max(0.01, avg)) * 100;

  if (slopePctPerBar > 0.03) {
    return {
      name: `Trend Up (${tf})`,
      bias: 'bullish',
      confidence: clamp(50 + slopePctPerBar * 800, 55, 85),
      reason: `Regression slope up (${slopePctPerBar.toFixed(2)}% per bar)`,
    };
  }
  if (slopePctPerBar < -0.03) {
    return {
      name: `Trend Down (${tf})`,
      bias: 'bearish',
      confidence: clamp(50 + Math.abs(slopePctPerBar) * 800, 55, 85),
      reason: `Regression slope down (${slopePctPerBar.toFixed(2)}% per bar)`,
    };
  }
  return null;
}

function detectDoubleTopBottom(
  candles: Candle[],
  pivotsHigh: Array<{ i: number; price: number }>,
  pivotsLow: Array<{ i: number; price: number }>,
  atr: number,
  tf: string
): { pattern: DetectedPattern; keyLines?: KeyLine[] } | null {
  const last = candles[candles.length - 1];

  const tol = atr * 0.35;
  const highs = pivotsHigh.slice(-6);
  if (highs.length >= 2) {
    const a = highs[highs.length - 2];
    const b = highs[highs.length - 1];
    if (Math.abs(a.price - b.price) <= tol && b.i - a.i >= 5) {
      const lowsBetween = pivotsLow.filter(pl => pl.i > a.i && pl.i < b.i);
      if (lowsBetween.length > 0) {
        const neckline = lowsBetween.reduce((m, x) => (x.price < m ? x.price : m), lowsBetween[0].price);
        const brokeNeckline = last.close < neckline;
        const conf = clamp(60 + (Math.abs(a.price - neckline) / atr) * 6 + (brokeNeckline ? 10 : 0), 60, 90);
        return {
          pattern: {
            name: `Double Top (${tf})`,
            bias: 'bearish',
            confidence: conf,
            reason: `Two pivot highs near ${b.price.toFixed(2)}; neckline near ${neckline.toFixed(2)}${brokeNeckline ? ' (neckline broken)' : ''}`,
            keyLines: [
              { name: 'double_top_level', level: (a.price + b.price) / 2, reason: 'Twin highs' },
              { name: 'neckline', level: neckline, reason: 'Pivot low between highs' },
            ],
          },
          keyLines: [{ name: 'neckline', level: neckline, reason: 'Double top neckline' }],
        };
      }
    }
  }

  const lows = pivotsLow.slice(-6);
  if (lows.length >= 2) {
    const a = lows[lows.length - 2];
    const b = lows[lows.length - 1];
    if (Math.abs(a.price - b.price) <= tol && b.i - a.i >= 5) {
      const highsBetween = pivotsHigh.filter(ph => ph.i > a.i && ph.i < b.i);
      if (highsBetween.length > 0) {
        const neckline = highsBetween.reduce((m, x) => (x.price > m ? x.price : m), highsBetween[0].price);
        const brokeNeckline = last.close > neckline;
        const conf = clamp(60 + (Math.abs(neckline - a.price) / atr) * 6 + (brokeNeckline ? 10 : 0), 60, 90);
        return {
          pattern: {
            name: `Double Bottom (${tf})`,
            bias: 'bullish',
            confidence: conf,
            reason: `Two pivot lows near ${b.price.toFixed(2)}; neckline near ${neckline.toFixed(2)}${brokeNeckline ? ' (neckline broken)' : ''}`,
            keyLines: [
              { name: 'double_bottom_level', level: (a.price + b.price) / 2, reason: 'Twin lows' },
              { name: 'neckline', level: neckline, reason: 'Pivot high between lows' },
            ],
          },
          keyLines: [{ name: 'neckline', level: neckline, reason: 'Double bottom neckline' }],
        };
      }
    }
  }

  return null;
}

function detectHeadAndShoulders(
  pivotsHigh: Array<{ i: number; price: number }>,
  pivotsLow: Array<{ i: number; price: number }>,
  atr: number,
  tf: string
): { pattern: DetectedPattern; keyLines?: KeyLine[] } | null {
  const highs = pivotsHigh.slice(-10);
  const tol = atr * 0.45;
  if (highs.length >= 3) {
    const a = highs[highs.length - 3];
    const b = highs[highs.length - 2];
    const c = highs[highs.length - 1];

    const headHigher = b.price > a.price + tol && b.price > c.price + tol;
    const shouldersSimilar = Math.abs(a.price - c.price) <= tol;

    if (headHigher && shouldersSimilar && c.i - a.i >= 8) {
      const lows1 = pivotsLow.filter(l => l.i > a.i && l.i < b.i);
      const lows2 = pivotsLow.filter(l => l.i > b.i && l.i < c.i);
      if (lows1.length > 0 && lows2.length > 0) {
        const n1 = lows1.reduce((m, x) => (x.price < m ? x.price : m), lows1[0].price);
        const n2 = lows2.reduce((m, x) => (x.price < m ? x.price : m), lows2[0].price);
        const neckline = (n1 + n2) / 2;

        const conf = clamp(62 + ((b.price - neckline) / atr) * 5, 62, 90);
        return {
          pattern: {
            name: `Head & Shoulders (${tf})`,
            bias: 'bearish',
            confidence: conf,
            reason: `Head ${b.price.toFixed(2)} above shoulders (~${((a.price + c.price) / 2).toFixed(2)}); neckline ~${neckline.toFixed(2)}`,
            keyLines: [
              { name: 'neckline', level: neckline, reason: 'H&S neckline' },
              { name: 'head', level: b.price, reason: 'Head high' },
            ],
          },
          keyLines: [{ name: 'neckline', level: neckline, reason: 'H&S neckline' }],
        };
      }
    }
  }

  const lows = pivotsLow.slice(-10);
  if (lows.length >= 3) {
    const a = lows[lows.length - 3];
    const b = lows[lows.length - 2];
    const c = lows[lows.length - 1];

    const headLower = b.price < a.price - tol && b.price < c.price - tol;
    const shouldersSimilar = Math.abs(a.price - c.price) <= tol;

    if (headLower && shouldersSimilar && c.i - a.i >= 8) {
      const highs1 = pivotsHigh.filter(h => h.i > a.i && h.i < b.i);
      const highs2 = pivotsHigh.filter(h => h.i > b.i && h.i < c.i);
      if (highs1.length > 0 && highs2.length > 0) {
        const n1 = highs1.reduce((m, x) => (x.price > m ? x.price : m), highs1[0].price);
        const n2 = highs2.reduce((m, x) => (x.price > m ? x.price : m), highs2[0].price);
        const neckline = (n1 + n2) / 2;

        const conf = clamp(62 + ((neckline - b.price) / atr) * 5, 62, 90);
        return {
          pattern: {
            name: `Inverse H&S (${tf})`,
            bias: 'bullish',
            confidence: conf,
            reason: `Head ${b.price.toFixed(2)} below shoulders (~${((a.price + c.price) / 2).toFixed(2)}); neckline ~${neckline.toFixed(2)}`,
            keyLines: [
              { name: 'neckline', level: neckline, reason: 'Inverse H&S neckline' },
              { name: 'head', level: b.price, reason: 'Head low' },
            ],
          },
          keyLines: [{ name: 'neckline', level: neckline, reason: 'Inverse H&S neckline' }],
        };
      }
    }
  }

  return null;
}

function detectFlag(candles: Candle[], atr: number, tf: string): DetectedPattern | null {
  const n = candles.length;
  const impulseWindow = 16;
  const flagWindow = 14;

  if (n < impulseWindow + flagWindow + 5) return null;

  const impulseSlice = candles.slice(-(impulseWindow + flagWindow), -flagWindow);
  const flagSlice = candles.slice(-flagWindow);

  const impulseMove = impulseSlice[impulseSlice.length - 1].close - impulseSlice[0].close;
  const impulsePct = (impulseMove / Math.max(0.01, impulseSlice[0].close)) * 100;

  const flagHigh = Math.max(...flagSlice.map(c => c.high));
  const flagLow = Math.min(...flagSlice.map(c => c.low));
  const flagRange = flagHigh - flagLow;

  const tight = flagRange <= atr * 1.2;

  if (tight && Math.abs(impulsePct) >= 2.0) {
    if (impulseMove > 0) {
      return {
        name: `Bull Flag (${tf})`,
        bias: 'bullish',
        confidence: clamp(58 + Math.min(25, impulsePct * 3) + (tight ? 10 : 0), 58, 90),
        reason: `Up-impulse (${impulsePct.toFixed(1)}%) then tight consolidation (≤1.2 ATR)`,
        keyLines: [{ name: 'flag_high', level: flagHigh, reason: 'Flag resistance' }],
      };
    }
    return {
      name: `Bear Flag (${tf})`,
      bias: 'bearish',
      confidence: clamp(58 + Math.min(25, Math.abs(impulsePct) * 3) + (tight ? 10 : 0), 58, 90),
      reason: `Down-impulse (${impulsePct.toFixed(1)}%) then tight consolidation (≤1.2 ATR)`,
      keyLines: [{ name: 'flag_low', level: flagLow, reason: 'Flag support' }],
    };
  }

  return null;
}

function linearRegressionSlope(y: number[]): number {
  const n = y.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = y.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - xMean;
    const dy = y[i] - yMean;
    num += dx * dy;
    den += dx * dx;
  }
  return den === 0 ? 0 : num / den;
}

function summarize(patterns: DetectedPattern[]): PatternScanResult['summary'] {
  if (!patterns.length) return { bias: 'neutral', confidence: 30, reason: 'No clear patterns detected' };

  let bull = 0;
  let bear = 0;
  for (const p of patterns) {
    if (p.bias === 'bullish') bull += p.confidence;
    if (p.bias === 'bearish') bear += p.confidence;
  }

  const total = bull + bear;
  if (total < 60) return { bias: 'neutral', confidence: 35, reason: 'Pattern signals weak' };

  const diff = bull - bear;
  if (Math.abs(diff) < total * 0.15) {
    return { bias: 'neutral', confidence: clamp(35 + total * 0.1, 35, 55), reason: 'Patterns mixed / balanced' };
  }

  const bias: PatternBias = diff > 0 ? 'bullish' : 'bearish';
  const confidence = clamp(45 + (Math.abs(diff) / total) * 50, 45, 85);
  const reason = bias === 'bullish' ? 'Pattern bias leans bullish' : 'Pattern bias leans bearish';

  return { bias, confidence, reason };
}

function dedupeKeyLines(lines: KeyLine[]): KeyLine[] {
  const out: KeyLine[] = [];
  const seen = new Set<string>();
  for (const l of lines) {
    const key = `${l.name}:${l.level.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }
  return out;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
