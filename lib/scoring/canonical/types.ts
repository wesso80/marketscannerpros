/**
 * Canonical scoring engine — shared types.
 *
 * One engine produces one result per (symbol, timeframe, bar). Every surface (scanner, daily picks, Golden Egg,
 * Deep Analysis, cockpit grades) reads this result instead of computing its own score. See ./engine.ts.
 */

export const CANONICAL_VERSION = 'msp.canonical.v1' as const;

export type CanonicalAssetClass = 'equity' | 'crypto' | 'forex';
export type CanonicalDirection = 'long' | 'short';
export type CanonicalPermission = 'PASS' | 'WATCH' | 'BLOCK';
export type CanonicalGrade = 'A' | 'B' | 'C' | 'F';
export type SetupType = 'TREND_CONTINUATION' | 'PULLBACK' | 'SQUEEZE' | 'EXHAUSTION_FADE';
export const SETUP_TYPES: SetupType[] = ['TREND_CONTINUATION', 'PULLBACK', 'SQUEEZE', 'EXHAUSTION_FADE'];

export interface CanonicalReason { code: string; message: string }

/** Minimal OHLCV bar (oldest first). `t` = bar open time, ISO-8601 UTC. */
export interface CanonicalBar {
  t: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

export interface SwingPoint { index: number; price: number; t: string }

/**
 * Point-in-time features at the last bar. NaN / null = unavailable (never a fabricated default).
 * All distances are in ATR units so they are scale-free and mirror exactly when the chart is flipped.
 */
export interface CanonicalFeatures {
  mode: 'bars' | 'snapshot';
  barDate: string | null;
  bars: number;
  close: number;
  open: number;
  ema20: number; ema50: number; ema200: number;
  sma50: number; sma200: number;
  adx: number; plusDI: number; minusDI: number;
  /** ADX change over the last 3 bars (rising trend strength > 0). */
  adxSlope: number;
  atr: number;
  atrPct: number;
  /** Percentile (0–100) of today's ATR% within the symbol's trailing ~252 bars. */
  atrPctPercentile: number;
  /** Bollinger(20, 2σ) width as % of the middle band (display) and its percentile over ~252 bars. */
  bbwPct: number;
  bbwPercentile: number;
  bbUpper: number; bbLower: number;
  /** TTM-style squeeze ratio: Bollinger width / Keltner(20, 1.5 ATR) width (< 1 = squeeze on) and its percentile. */
  squeezeRatio: number;
  squeezeRatioPercentile: number;
  rsi: number;
  /** Highest / lowest RSI over the last 5 bars and RSI change over 3 bars. */
  rsiMax5: number; rsiMin5: number; rsiSlope: number;
  /** Last bar volume / prior 20-bar average; null when the provider gives no volume. */
  volumeRatio: number | null;
  /** 5-bar average volume / prior 20-bar average (< 0.8 = drying up). */
  volumeTrend5: number | null;
  /** A climax bar (volume ≥ 2.5× and range ≥ 1.5 ATR) in the last 3 bars: +1 up-close, −1 down-close, 0 none. */
  climax: number | null;
  /** (close − EMA20) / ATR, signed. */
  distEma20Atr: number;
  /** (close − EMA50) / ATR, signed. */
  distEma50Atr: number;
  /** +1 close above upper Bollinger band, −1 below lower, 0 inside. */
  beyondBand: number;
  /** Swing structure from confirmed pivots (3 bars each side). */
  structure: 'up' | 'down' | 'mixed' | 'unknown';
  lastPivotHigh: SwingPoint | null;
  lastPivotLow: SwingPoint | null;
  /** Nearest confirmed pivot high above / pivot low below the close (lookback ~250 bars). */
  resistanceAbove: number | null;
  supportBelow: number | null;
  /** Extremes of the last 5 bars (unconfirmed swing for fades and pullbacks). */
  high5: number; low5: number;
  /** Extremes of the last 10 bars. */
  high10: number; low10: number;
}

export interface FactorResult {
  name: string;
  /** 0..1 contribution before weighting; null = factor unavailable (excluded from score and coverage). */
  value: number | null;
  weight: number;
  /** True when value ≥ 0.5 (a factor "passes" when it supports the setup). */
  pass: boolean | null;
  /** Raw inputs that produced the value, for display ("RSI 72.4", "stretch 2.6 ATR"). */
  raw: Record<string, number | string | null>;
  note?: string;
}

export interface CanonicalLevels {
  entry: number;
  invalidation: number;
  target: number;
  riskReward: number;
  /** How invalidation was set: swing structure, recent extreme, or an ATR fallback. */
  invalidationBasis: 'swing' | 'recent_extreme' | 'atr_fallback';
  targetBasis: 'opposing_level' | 'ema20' | 'projected';
  flags: string[];
}

export interface SetupCandidate {
  setupType: SetupType;
  direction: CanonicalDirection;
  eligible: boolean;
  ineligibleReason?: string;
  score: number;
  coverage: number;
  factors: FactorResult[];
  levels: CanonicalLevels;
}

export interface CanonicalThreshold { pass: number; watch: number; gradeA: number; gradeB: number }

/** Empirical statistics for the chosen setup (Phase 3 calibration; daily equity/crypto only). */
export interface CanonicalCalibration {
  /** Share of historical trades in this setup × direction × R:R band that reached the target before invalidation. */
  pTargetFirst: number;
  /** Mean realised R per trade after costs (entry next open, engine's own invalidation/target, time stop). */
  expectedR: number;
  /** Percentile (0–100) of expectedR within its direction's reference distribution — the display score. */
  percentile: number;
  horizonBars: number;
  /** Trades in the R:R-band cell / in the whole setup × direction bucket. */
  sample: number;
  bucketSample: number;
  bucketMeanR: number;
  bucketCi90: [number, number];
  /** Same-direction buy/short-everything bracket baseline (net R). */
  baselineR: number;
  costsBps: number;
  /** True only when out-of-sample walk-forward validation showed positive net R with CI above zero. */
  validatedEdge: boolean;
  version: string;
}

export interface CanonicalResult {
  version: typeof CANONICAL_VERSION;
  symbol: string;
  assetClass: CanonicalAssetClass;
  timeframe: string;
  mode: 'bars' | 'snapshot';
  barDate: string | null;
  dataTimestamp: string | null;
  setupType: SetupType | 'NONE';
  direction: CanonicalDirection | 'neutral';
  /** Display score 0–100. Calibrated context: percentile of calibrated expected R (monotone display only).
   *  Uncalibrated context: the raw factor-alignment score (see scoreBasis). */
  score: number;
  /** Raw weighted factor alignment 0–100 of the chosen setup (not a probability; not predictive on its own). */
  factorScore: number;
  scoreBasis: 'calibrated_expectancy_percentile' | 'factor_alignment_uncalibrated';
  calibration: CanonicalCalibration | null;
  grade: CanonicalGrade;
  permission: CanonicalPermission;
  blockReasons: CanonicalReason[];
  watchReasons: CanonicalReason[];
  flags: CanonicalReason[];
  factors: FactorResult[];
  coverage: number;
  trust: string | null;
  levels: CanonicalLevels | null;
  /** Position-size multiplier from the regime overlay (1 = full size). */
  sizeMultiplier: number;
  thresholds: CanonicalThreshold | null;
  /** Every setup × direction evaluated, best first. */
  candidates: Array<Pick<SetupCandidate, 'setupType' | 'direction' | 'eligible' | 'ineligibleReason' | 'score' | 'coverage'> & { expectedR?: number; pTargetFirst?: number }>;
  /** Headline raw values for display. */
  raw: Record<string, number | string | null>;
}
