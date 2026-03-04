/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DECOMPRESSION ENGINE — Time to 50% Framework (Single-TF)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Core premise: After every candle close, price is pulled toward the prior
 * candle's 50% (HL2) level. The "decompression window" is the deterministic
 * time period during which this pull is statistically strongest.
 *
 * Two anchor modes:
 *   • postOpen  (intraday TFs ≤ 12h) — window starts AFTER the candle close,
 *     measured from the start of the NEW candle.
 *   • preClose  (daily+ TFs ≥ 1D)   — window ends AT the candle close,
 *     measured backward from the close of the FORMING candle.
 *
 * Key outputs per TF:
 *   - mid50Level: prior candle HL2
 *   - windowActive: is NOW inside the decompression window?
 *   - tagged: has the current candle already swept through the mid50?
 *   - score (0–10): 10 = inside window + untagged, decays with distance
 *   - pullDirection: is 50% above or below current price?
 *
 * Volatility adjustment: adjusted_window = base_window × (ATR_current / ATR_baseline)
 * where ATR_baseline is the long-run average for the asset/TF.
 */

// ─── TF Identifiers ────────────────────────────────────────────────────────

export type DecompressionTFLabel =
  | '5m' | '10m' | '15m' | '30m'
  | '1h' | '2h' | '3h' | '4h' | '6h' | '8h' | '12h'
  | '1D' | '2D' | '3D' | '4D' | '5D'
  | `${number}W`
  | '1M' | '2M' | '3M'
  | '6M' | '1Y' | '2Y' | '4Y' | '5Y';

// ─── Window Configuration ───────────────────────────────────────────────────

export type AnchorMode = 'postOpen' | 'preClose';

export interface DecompressionWindowConfig {
  label: DecompressionTFLabel;
  tfMinutes: number;
  anchor: AnchorMode;
  /** Window offset range in minutes [start, end].
   *  postOpen:  window is [start, end] minutes AFTER candle open
   *  preClose:  window is [end, start] minutes BEFORE candle close
   *             (start > end means start is further from close) */
  windowMinutes: [number, number];
  /** TF importance weight for aggregation (higher TF = heavier) */
  weight: number;
}

/**
 * Master decompression window table.
 * Sources: user-supplied empirical observation across equity intraday + daily+ TFs.
 *
 * Intraday (postOpen): window in minutes from the start of the NEW candle.
 * Daily+   (preClose): window in minutes before the close of the FORMING candle.
 */
export const DECOMPRESSION_WINDOWS: DecompressionWindowConfig[] = [
  // ── Micro / Scalping (postOpen) ──
  { label: '5m',  tfMinutes: 5,      anchor: 'postOpen',  windowMinutes: [0.5,  1],    weight: 0.4 },
  { label: '10m', tfMinutes: 10,     anchor: 'postOpen',  windowMinutes: [1,    1.5],  weight: 0.5 },
  { label: '15m', tfMinutes: 15,     anchor: 'postOpen',  windowMinutes: [1.5,  2.5],  weight: 0.6 },
  { label: '30m', tfMinutes: 30,     anchor: 'postOpen',  windowMinutes: [3,    5],    weight: 0.7 },

  // ── Intraday (postOpen) ──
  { label: '1h',  tfMinutes: 60,     anchor: 'postOpen',  windowMinutes: [7,    9],    weight: 1.0 },
  { label: '2h',  tfMinutes: 120,    anchor: 'postOpen',  windowMinutes: [8,    11],   weight: 1.2 },
  { label: '3h',  tfMinutes: 180,    anchor: 'postOpen',  windowMinutes: [8,    12],   weight: 1.3 },
  { label: '4h',  tfMinutes: 240,    anchor: 'postOpen',  windowMinutes: [9,    12],   weight: 1.4 },
  { label: '6h',  tfMinutes: 360,    anchor: 'postOpen',  windowMinutes: [15,   20],   weight: 1.6 },
  { label: '8h',  tfMinutes: 480,    anchor: 'postOpen',  windowMinutes: [15,   20],   weight: 1.8 },
  { label: '12h', tfMinutes: 720,    anchor: 'postOpen',  windowMinutes: [20,   30],   weight: 2.0 },

  // ── Daily+ (preClose) ──
  { label: '1D',  tfMinutes: 1440,     anchor: 'preClose', windowMinutes: [60,    60],     weight: 3.0 },
  { label: '2D',  tfMinutes: 2880,     anchor: 'preClose', windowMinutes: [120,   120],    weight: 3.5 },
  { label: '3D',  tfMinutes: 4320,     anchor: 'preClose', windowMinutes: [180,   180],    weight: 4.0 },
  { label: '4D',  tfMinutes: 5760,     anchor: 'preClose', windowMinutes: [240,   240],    weight: 4.5 },
  { label: '5D',  tfMinutes: 7200,     anchor: 'preClose', windowMinutes: [312,   312],    weight: 5.0 },

  // ── Weekly (preClose) — 1W through 52W ──
  { label: '1W',  tfMinutes: 10080,   anchor: 'preClose', windowMinutes: [390,   390],     weight: 6.0 },
  { label: '2W',  tfMinutes: 20160,   anchor: 'preClose', windowMinutes: [780,   780],     weight: 6.6 },
  { label: '3W',  tfMinutes: 30240,   anchor: 'preClose', windowMinutes: [1170,  1170],    weight: 7.0 },
  { label: '4W',  tfMinutes: 40320,   anchor: 'preClose', windowMinutes: [1560,  1560],    weight: 7.2 },
  { label: '5W',  tfMinutes: 50400,   anchor: 'preClose', windowMinutes: [1950,  1950],    weight: 7.4 },
  { label: '6W',  tfMinutes: 60480,   anchor: 'preClose', windowMinutes: [2340,  2340],    weight: 7.6 },
  { label: '7W',  tfMinutes: 70560,   anchor: 'preClose', windowMinutes: [2730,  2730],    weight: 7.8 },
  { label: '8W',  tfMinutes: 80640,   anchor: 'preClose', windowMinutes: [3120,  3120],    weight: 7.9 },
  { label: '9W',  tfMinutes: 90720,   anchor: 'preClose', windowMinutes: [3510,  3510],    weight: 8.0 },
  { label: '10W', tfMinutes: 100800,  anchor: 'preClose', windowMinutes: [3900,  3900],    weight: 8.1 },
  { label: '11W', tfMinutes: 110880,  anchor: 'preClose', windowMinutes: [4290,  4290],    weight: 8.2 },
  { label: '12W', tfMinutes: 120960,  anchor: 'preClose', windowMinutes: [4680,  4680],    weight: 8.2 },
  { label: '13W', tfMinutes: 131040,  anchor: 'preClose', windowMinutes: [5070,  5070],    weight: 8.3 },
  { label: '14W', tfMinutes: 141120,  anchor: 'preClose', windowMinutes: [5460,  5460],    weight: 8.4 },
  { label: '15W', tfMinutes: 151200,  anchor: 'preClose', windowMinutes: [5850,  5850],    weight: 8.4 },
  { label: '16W', tfMinutes: 161280,  anchor: 'preClose', windowMinutes: [6240,  6240],    weight: 8.5 },
  { label: '17W', tfMinutes: 171360,  anchor: 'preClose', windowMinutes: [6630,  6630],    weight: 8.6 },
  { label: '18W', tfMinutes: 181440,  anchor: 'preClose', windowMinutes: [7020,  7020],    weight: 8.6 },
  { label: '19W', tfMinutes: 191520,  anchor: 'preClose', windowMinutes: [7410,  7410],    weight: 8.6 },
  { label: '20W', tfMinutes: 201600,  anchor: 'preClose', windowMinutes: [7800,  7800],    weight: 8.7 },
  { label: '21W', tfMinutes: 211680,  anchor: 'preClose', windowMinutes: [8190,  8190],    weight: 8.7 },
  { label: '22W', tfMinutes: 221760,  anchor: 'preClose', windowMinutes: [8580,  8580],    weight: 8.8 },
  { label: '23W', tfMinutes: 231840,  anchor: 'preClose', windowMinutes: [8970,  8970],    weight: 8.8 },
  { label: '24W', tfMinutes: 241920,  anchor: 'preClose', windowMinutes: [9360,  9360],    weight: 8.9 },
  { label: '25W', tfMinutes: 252000,  anchor: 'preClose', windowMinutes: [9750,  9750],    weight: 8.9 },
  { label: '26W', tfMinutes: 262080,  anchor: 'preClose', windowMinutes: [10140, 10140],   weight: 8.9 },
  { label: '27W', tfMinutes: 272160,  anchor: 'preClose', windowMinutes: [10530, 10530],   weight: 9.0 },
  { label: '28W', tfMinutes: 282240,  anchor: 'preClose', windowMinutes: [10920, 10920],   weight: 9.0 },
  { label: '29W', tfMinutes: 292320,  anchor: 'preClose', windowMinutes: [11310, 11310],   weight: 9.0 },
  { label: '30W', tfMinutes: 302400,  anchor: 'preClose', windowMinutes: [11700, 11700],   weight: 9.1 },
  { label: '31W', tfMinutes: 312480,  anchor: 'preClose', windowMinutes: [12090, 12090],   weight: 9.1 },
  { label: '32W', tfMinutes: 322560,  anchor: 'preClose', windowMinutes: [12480, 12480],   weight: 9.1 },
  { label: '33W', tfMinutes: 332640,  anchor: 'preClose', windowMinutes: [12870, 12870],   weight: 9.1 },
  { label: '34W', tfMinutes: 342720,  anchor: 'preClose', windowMinutes: [13260, 13260],   weight: 9.2 },
  { label: '35W', tfMinutes: 352800,  anchor: 'preClose', windowMinutes: [13650, 13650],   weight: 9.2 },
  { label: '36W', tfMinutes: 362880,  anchor: 'preClose', windowMinutes: [14040, 14040],   weight: 9.2 },
  { label: '37W', tfMinutes: 372960,  anchor: 'preClose', windowMinutes: [14430, 14430],   weight: 9.3 },
  { label: '38W', tfMinutes: 383040,  anchor: 'preClose', windowMinutes: [14820, 14820],   weight: 9.3 },
  { label: '39W', tfMinutes: 393120,  anchor: 'preClose', windowMinutes: [15210, 15210],   weight: 9.3 },
  { label: '40W', tfMinutes: 403200,  anchor: 'preClose', windowMinutes: [15600, 15600],   weight: 9.3 },
  { label: '41W', tfMinutes: 413280,  anchor: 'preClose', windowMinutes: [15990, 15990],   weight: 9.3 },
  { label: '42W', tfMinutes: 423360,  anchor: 'preClose', windowMinutes: [16380, 16380],   weight: 9.4 },
  { label: '43W', tfMinutes: 433440,  anchor: 'preClose', windowMinutes: [16770, 16770],   weight: 9.4 },
  { label: '44W', tfMinutes: 443520,  anchor: 'preClose', windowMinutes: [17160, 17160],   weight: 9.4 },
  { label: '45W', tfMinutes: 453600,  anchor: 'preClose', windowMinutes: [17550, 17550],   weight: 9.4 },
  { label: '46W', tfMinutes: 463680,  anchor: 'preClose', windowMinutes: [17940, 17940],   weight: 9.5 },
  { label: '47W', tfMinutes: 473760,  anchor: 'preClose', windowMinutes: [18330, 18330],   weight: 9.5 },
  { label: '48W', tfMinutes: 483840,  anchor: 'preClose', windowMinutes: [18720, 18720],   weight: 9.5 },
  { label: '49W', tfMinutes: 493920,  anchor: 'preClose', windowMinutes: [19110, 19110],   weight: 9.5 },
  { label: '50W', tfMinutes: 504000,  anchor: 'preClose', windowMinutes: [19500, 19500],   weight: 9.5 },
  { label: '51W', tfMinutes: 514080,  anchor: 'preClose', windowMinutes: [19890, 19890],   weight: 9.5 },
  { label: '52W', tfMinutes: 524160,  anchor: 'preClose', windowMinutes: [20280, 20280],   weight: 9.6 },

  // ── Monthly (preClose) ──
  { label: '1M',  tfMinutes: 43200,    anchor: 'preClose', windowMinutes: [1560,  1560],   weight: 8.0 },
  { label: '2M',  tfMinutes: 86400,    anchor: 'preClose', windowMinutes: [3120,  3120],   weight: 8.5 },
  { label: '3M',  tfMinutes: 129600,   anchor: 'preClose', windowMinutes: [4680,  4680],   weight: 9.0 },

  // ── Semi-annual / Annual (preClose) ──
  { label: '6M',  tfMinutes: 259200,   anchor: 'preClose', windowMinutes: [9360,  9360],   weight: 9.5 },
  { label: '1Y',  tfMinutes: 525600,   anchor: 'preClose', windowMinutes: [18720, 18720],  weight: 10.0 },
  { label: '2Y',  tfMinutes: 1051200,  anchor: 'preClose', windowMinutes: [37440, 37440],  weight: 10.0 },
  { label: '4Y',  tfMinutes: 2102400,  anchor: 'preClose', windowMinutes: [74880, 74880],  weight: 10.0 },
  { label: '5Y',  tfMinutes: 2628000,  anchor: 'preClose', windowMinutes: [149760,149760], weight: 10.0 },
];

/** Quick lookup by label */
export const WINDOW_BY_LABEL = new Map<string, DecompressionWindowConfig>(
  DECOMPRESSION_WINDOWS.map(w => [w.label, w])
);

// ─── Input / Output Types ───────────────────────────────────────────────────

export interface DecompressionCandle {
  high: number;
  low: number;
  close: number;
  /** ATR value for volatility adjustment (optional; if omitted, no vol adjustment) */
  atr?: number;
}

export interface DecompressionTFInput {
  /** TF label matching DecompressionTFLabel or TIMEFRAMES[].label */
  tfLabel: string;
  /** Minutes in this TF */
  tfMinutes: number;
  /** The PRIOR (completed) candle */
  priorCandle: DecompressionCandle;
  /** The CURRENT (forming) candle — need its range to detect mid50 tags */
  currentCandle: DecompressionCandle;
  /** Current live price */
  currentPrice: number;
  /** Minutes remaining until this TF closes */
  minsToClose: number;
  /** Minutes elapsed since this TF's most recent close (candle open age) */
  minsSinceOpen?: number;
  /** Baseline ATR for this TF (long-run average). If provided with currentCandle.atr,
   *  enables volatility adjustment of the window */
  atrBaseline?: number;
}

export interface DecompressionTFResult {
  tfLabel: string;
  tfMinutes: number;
  anchor: AnchorMode;
  weight: number;

  // ── 50% Level ──
  mid50Level: number;
  distanceToMid50Pct: number;   // % distance: positive = above, negative = below
  pullDirection: 'up' | 'down' | 'none';

  // ── Window State ──
  windowActive: boolean;
  windowStartMin: number;       // Effective window start (after vol adjustment)
  windowEndMin: number;         // Effective window end   (after vol adjustment)
  windowProgressPct: number;    // 0-100: how far through the window we are (0 = not started, 100 = finished)
  volAdjustmentFactor: number;  // 1.0 = no adjustment

  // ── Tag Detection ──
  tagged: boolean;              // Has the current candle already swept through mid50?

  // ── Score ──
  score: number;                // 0-10: 10 = inside window + untagged, decays from there
  scoreReason: string;          // Human-readable explanation
}

// ─── Core Computation ───────────────────────────────────────────────────────

/**
 * Compute the decompression state for a single timeframe.
 *
 * Deterministic, pure function — no side effects, no API calls.
 */
export function computeDecompressionState(input: DecompressionTFInput): DecompressionTFResult {
  const { tfLabel, tfMinutes, priorCandle, currentCandle, currentPrice, minsToClose } = input;
  const minsSinceOpen = input.minsSinceOpen ?? (tfMinutes - minsToClose);

  // ── Look up window config; fall back to formula if TF not in table ──
  const cfg = WINDOW_BY_LABEL.get(tfLabel);
  const anchor: AnchorMode = cfg?.anchor ?? (tfMinutes >= 1440 ? 'preClose' : 'postOpen');
  const weight = cfg?.weight ?? Math.min(10, 0.4 + Math.log2(Math.max(1, tfMinutes / 5)) * 0.6);

  // Base window range (minutes)
  let baseStart = cfg?.windowMinutes[0] ?? tfMinutes * 0.10;
  let baseEnd   = cfg?.windowMinutes[1] ?? tfMinutes * 0.15;
  // Ensure start ≤ end
  if (baseStart > baseEnd) [baseStart, baseEnd] = [baseEnd, baseStart];

  // ── Volatility adjustment ──
  let volFactor = 1.0;
  if (input.atrBaseline && input.atrBaseline > 0 && currentCandle.atr && currentCandle.atr > 0) {
    volFactor = Math.max(0.5, Math.min(2.0, currentCandle.atr / input.atrBaseline));
  }
  const adjStart = baseStart * volFactor;
  const adjEnd   = baseEnd * volFactor;

  // ── Mid-50 level from prior candle ──
  const mid50Level = (priorCandle.high + priorCandle.low) / 2;
  const distanceToMid50Pct = mid50Level !== 0
    ? ((currentPrice - mid50Level) / mid50Level) * 100
    : 0;
  const pullDirection: 'up' | 'down' | 'none' =
    mid50Level > currentPrice * 1.0001 ? 'up' :
    mid50Level < currentPrice * 0.9999 ? 'down' :
    'none';

  // ── Tag detection: has the current forming candle swept through mid50? ──
  const tagged = currentCandle.low <= mid50Level && currentCandle.high >= mid50Level;

  // ── Window activation check ──
  let windowActive = false;
  let windowProgressPct = 0;

  if (anchor === 'postOpen') {
    // PostOpen: window is [adjStart, adjEnd] minutes after candle opened
    windowActive = minsSinceOpen >= adjStart && minsSinceOpen <= adjEnd;
    if (minsSinceOpen < adjStart) {
      windowProgressPct = 0;
    } else if (minsSinceOpen > adjEnd) {
      windowProgressPct = 100;
    } else {
      const range = adjEnd - adjStart;
      windowProgressPct = range > 0 ? ((minsSinceOpen - adjStart) / range) * 100 : 100;
    }
  } else {
    // PreClose: window is [adjEnd, adjStart] minutes BEFORE close
    // i.e., window starts when minsToClose <= max(adjStart, adjEnd), ends at close
    const windowOpenAt = Math.max(adjStart, adjEnd);
    windowActive = minsToClose <= windowOpenAt && minsToClose > 0;
    if (minsToClose > windowOpenAt) {
      windowProgressPct = 0;
    } else if (minsToClose <= 0) {
      windowProgressPct = 100;
    } else {
      windowProgressPct = windowOpenAt > 0 ? ((windowOpenAt - minsToClose) / windowOpenAt) * 100 : 100;
    }
  }

  // ── Scoring (0–10) ──
  let score = 0;
  let scoreReason = '';

  if (tagged) {
    // Already tagged the 50% — decompression impulse partially spent
    score = windowActive ? 3 : 1;
    scoreReason = `Tagged mid50 ${mid50Level.toFixed(2)}${windowActive ? ' (window still active)' : ''}`;
  } else if (windowActive) {
    // Inside window, untagged — maximum potential
    // Scale 7–10 based on proximity of price to mid50 (closer = higher)
    const absDist = Math.abs(distanceToMid50Pct);
    if (absDist <= 0.1) {
      score = 10;
      scoreReason = `Inside window, price AT mid50 (${absDist.toFixed(2)}%)`;
    } else if (absDist <= 0.3) {
      score = 9;
      scoreReason = `Inside window, very close to mid50 (${absDist.toFixed(2)}%)`;
    } else if (absDist <= 0.5) {
      score = 8;
      scoreReason = `Inside window, near mid50 (${absDist.toFixed(2)}%)`;
    } else if (absDist <= 1.0) {
      score = 7;
      scoreReason = `Inside window, moderate pull to mid50 (${absDist.toFixed(2)}%)`;
    } else {
      // Far from 50% — linear decay from 7 towards 4
      score = Math.max(4, 7 - (absDist - 1.0) * 1.5);
      scoreReason = `Inside window, distant from mid50 (${absDist.toFixed(2)}%)`;
    }
  } else {
    // Outside window
    if (anchor === 'postOpen') {
      if (minsSinceOpen < adjStart) {
        // Before window opens — anticipatory
        const anticipatoryPct = adjStart > 0 ? minsSinceOpen / adjStart : 0;
        score = Math.min(3, anticipatoryPct * 3);
        scoreReason = `Pre-window (${minsSinceOpen.toFixed(0)}m / ${adjStart.toFixed(0)}m to start)`;
      } else {
        // After window closed — decaying
        const overshoot = adjEnd > 0 ? (minsSinceOpen - adjEnd) / adjEnd : 1;
        score = Math.max(0, 3 - overshoot * 3);
        scoreReason = `Post-window decay (${minsSinceOpen.toFixed(0)}m elapsed)`;
      }
    } else {
      // preClose: not yet in window
      const windowOpenAt = Math.max(adjStart, adjEnd);
      const timeUntilWindow = minsToClose - windowOpenAt;
      if (timeUntilWindow > 0 && timeUntilWindow < windowOpenAt * 0.5) {
        // Approaching window — ramp up
        score = Math.min(3, 3 * (1 - timeUntilWindow / (windowOpenAt * 0.5)));
        scoreReason = `Approaching preClose window (${timeUntilWindow.toFixed(0)}m away)`;
      } else {
        score = 0;
        scoreReason = `Outside window (${minsToClose.toFixed(0)}m to close)`;
      }
    }
  }

  return {
    tfLabel,
    tfMinutes,
    anchor,
    weight,
    mid50Level,
    distanceToMid50Pct,
    pullDirection,
    windowActive,
    windowStartMin: adjStart,
    windowEndMin: adjEnd,
    windowProgressPct: Math.round(windowProgressPct * 100) / 100,
    volAdjustmentFactor: Math.round(volFactor * 1000) / 1000,
    tagged,
    score: Math.round(score * 100) / 100,
    scoreReason,
  };
}

// ─── Batch Computation Helper ───────────────────────────────────────────────

/**
 * Compute decompression state for multiple TFs at once.
 * Convenience wrapper around `computeDecompressionState`.
 */
export function computeAllDecompressionStates(
  inputs: DecompressionTFInput[]
): DecompressionTFResult[] {
  return inputs.map(computeDecompressionState);
}

// ─── Bridge: existing scan data → DecompressionTFInput[] ────────────────────

/** Minimal shape matching DecompressionPull from confluence-learning-agent */
export interface LegacyDecompressionPull {
  tf: string;
  isDecompressing: boolean;
  minsToClose: number;
  mid50Level: number;
  pullDirection: 'up' | 'down' | 'none';
  pullStrength: number;
  distanceToMid50: number;
}

/** Minimal OHLC bar shape */
export interface BridgeCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  ts?: number;
}

/** TF-label → minutes lookup (matches confluence-learning-agent TIMEFRAMES) */
const TF_LABEL_TO_MINUTES: Record<string, number> = {
  '5m': 5, '10m': 10, '15m': 15, '30m': 30,
  '1h': 60, '2h': 120, '3h': 180, '4h': 240,
  '6h': 360, '8h': 480, '12h': 720,
  '1D': 1440, '2D': 2880, '3D': 4320, '4D': 5760, '5D': 7200,
  '6D': 8640, '7D': 10080, '8D': 11520, '9D': 12960, '10D': 14400,
  '1W': 10080, '2W': 20160, '3W': 30240, '4W': 40320,
  '5W': 50400, '6W': 60480, '7W': 70560, '8W': 80640,
  '9W': 90720, '10W': 100800, '11W': 110880, '12W': 120960,
  '13W': 131040, '14W': 141120, '15W': 151200, '16W': 161280,
  '17W': 171360, '18W': 181440, '19W': 191520, '20W': 201600,
  '21W': 211680, '22W': 221760, '23W': 231840, '24W': 241920,
  '25W': 252000, '26W': 262080, '27W': 272160, '28W': 282240,
  '29W': 292320, '30W': 302400, '31W': 312480, '32W': 322560,
  '33W': 332640, '34W': 342720, '35W': 352800, '36W': 362880,
  '37W': 372960, '38W': 383040, '39W': 393120, '40W': 403200,
  '41W': 413280, '42W': 423360, '43W': 433440, '44W': 443520,
  '45W': 453600, '46W': 463680, '47W': 473760, '48W': 483840,
  '49W': 493920, '50W': 504000, '51W': 514080, '52W': 524160,
  '1M': 43200, '2M': 86400, '3M': 129600,
  '4M': 172800, '5M': 216000, '6M': 259200,
  '1Y': 525600, '2Y': 1051200, '4Y': 2102400, '5Y': 2628000,
};

/**
 * Bridge existing scan infrastructure into the new decompression engine.
 *
 * @param decompressions   Array from confluenceResult.decompression.decompressions
 * @param currentPrice     Live price
 * @param candlesByTf      Optional: Record<string, BridgeCandle[]> for tag detection.
 *                         Keys are uppercase TF labels (e.g. '1H','4H','1D').
 */
export function bridgeFromScanData(
  decompressions: LegacyDecompressionPull[],
  currentPrice: number,
  candlesByTf?: Record<string, BridgeCandle[]>,
): DecompressionTFInput[] {
  const inputs: DecompressionTFInput[] = [];

  for (const d of decompressions) {
    const tfLabel = d.tf;
    const tfMinutes = TF_LABEL_TO_MINUTES[tfLabel] ?? 0;
    if (tfMinutes === 0) continue; // unknown TF

    // Resolve candles from the map (keys may be uppercase)
    const candleKey = tfLabel.toUpperCase();
    const candles = candlesByTf?.[candleKey];

    let priorCandle: DecompressionCandle;
    let curCandle: DecompressionCandle;

    if (candles && candles.length >= 2) {
      const prior = candles[candles.length - 2];
      const cur   = candles[candles.length - 1];
      priorCandle = { high: prior.high, low: prior.low, close: prior.close };
      curCandle   = { high: cur.high,   low: cur.low,   close: cur.close };
    } else {
      // Fallback: reconstruct prior candle from mid50Level (mid = (H+L)/2).
      // We don't know the exact H/L range — use currentPrice distance as proxy.
      const mid = d.mid50Level || currentPrice;
      const halfRange = Math.abs(currentPrice - mid) * 0.5 || currentPrice * 0.005;
      priorCandle = {
        high: mid + halfRange,
        low: mid - halfRange,
        close: mid,
      };
      curCandle = {
        high: currentPrice * 1.001,
        low: currentPrice * 0.999,
        close: currentPrice,
      };
    }

    const minsSinceOpen = Math.max(0, tfMinutes - d.minsToClose);

    inputs.push({
      tfLabel,
      tfMinutes,
      priorCandle,
      currentCandle: curCandle,
      currentPrice,
      minsToClose: d.minsToClose,
      minsSinceOpen,
    });
  }

  return inputs;
}
