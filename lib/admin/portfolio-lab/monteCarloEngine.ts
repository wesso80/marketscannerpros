/**
 * lib/admin/portfolio-lab/monteCarloEngine.ts
 *
 * Monte Carlo equity simulation for ARCA. Pure (no DB, no network).
 * Seeded with Mulberry32 so runs are deterministic for tests.
 *
 * Method:
 *   - Take the empirical distribution of historical R-multiples.
 *   - For each trial: starting from `startingEquity`, draw `horizon`
 *     R-multiples with replacement and accumulate equity using the
 *     fixed-fractional sizing rule
 *         pnl_t = R_t × (equity_t × riskPerTradePct/100).
 *   - Track each path's terminal equity, total return, max drawdown,
 *     and whether it ever breached `ruinDrawdownPct`.
 *
 * Aggregation:
 *   - Per-step envelope at p5 / p25 / p50 / p75 / p95 plus the mean.
 *   - Distributional summary of terminal equity, total return, and
 *     max drawdown (percentiles + mean + std).
 *   - Probability of profit, probability of ruin, expected shortfall
 *     (CVaR @ 95) on terminal returns.
 *   - A small bundle of representative sample paths for plotting.
 *
 * This is admin-only research output for a SIMULATED paper portfolio —
 * not a forecast, not advice. The expected-return drift in any single
 * historical sample dominates the Monte Carlo cone; treat it as a way
 * to visualise variance, not as a prediction of the future.
 */

// ───────────────────────────────────────────────────────────────────── types

export interface MonteCarloInput {
  /** Equity to simulate from — usually portfolio.totalEquity. */
  startingEquity: number;
  /** Fixed-fractional risk per trade (percent of equity). */
  riskPerTradePct: number;
  /** Empirical sample of trade R-multiples (e.g. from closed trades). */
  rMultiples: number[];
  /** Number of independent simulated paths. */
  trials: number;
  /** Number of trades to simulate forward per path. */
  horizon: number;
  /** Drawdown threshold (percent) that counts as "ruin". */
  ruinDrawdownPct: number;
  /** Optional explicit seed (else 0xC0FFEE). */
  seed?: number;
  /** How many sample paths to retain for plotting. Default 60, max 200. */
  samplePaths?: number;
}

export interface PercentileBand {
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

export interface EnvelopePoint {
  step: number;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  mean: number;
}

export interface MonteCarloResult {
  config: {
    trials: number;
    horizon: number;
    startingEquity: number;
    riskPerTradePct: number;
    ruinDrawdownPct: number;
    rMultiplesCount: number;
    seed: number;
  };
  empirical: {
    avgR: number | null;
    expectancyPerTradeDollars: number | null;
    expectedTerminalEquity: number | null;
  };
  terminalEquity: PercentileBand & { mean: number; std: number; min: number; max: number };
  totalReturnPct: PercentileBand & { mean: number };
  maxDrawdownPct: PercentileBand & { mean: number; worst: number };
  /** Fraction of paths ending above the starting equity. 0..1. */
  probabilityOfProfit: number;
  /** Fraction of paths that ever touched -ruinDrawdownPct from running peak. 0..1. */
  probabilityOfRuin: number;
  /** CVaR at 95% on terminal-return percent — mean of the worst 5% of paths. */
  expectedShortfallPct: number | null;
  envelope: EnvelopePoint[];
  samplePaths: number[][];
  warnings: string[];
}

// ───────────────────────────────────────────────────────────────────── PRNG

/** Mulberry32 — small, fast, deterministic. */
export function mulberry32(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ───────────────────────────────────────────────────────────────────── core

const DEFAULT_SEED = 0xC0FFEE;
const MAX_TRIALS = 10_000;
const MAX_HORIZON = 1_000;
const MAX_SAMPLE_PATHS = 200;

export function runMonteCarlo(input: MonteCarloInput): MonteCarloResult {
  const warnings: string[] = [];

  // ── clamp + validate inputs ──
  const trials = Math.max(1, Math.min(MAX_TRIALS, Math.floor(input.trials)));
  const horizon = Math.max(1, Math.min(MAX_HORIZON, Math.floor(input.horizon)));
  const startingEquity = Math.max(0, input.startingEquity);
  const riskPerTradePct = Math.max(0, input.riskPerTradePct);
  const ruinDrawdownPct = Math.max(0.01, Math.min(99.99, input.ruinDrawdownPct));
  const samplePathsTarget = Math.max(0, Math.min(MAX_SAMPLE_PATHS, input.samplePaths ?? 60));
  const seed = input.seed ?? DEFAULT_SEED;
  const rMultiples = input.rMultiples.filter((r) => Number.isFinite(r));
  const rCount = rMultiples.length;

  if (rCount === 0) warnings.push("No R-multiples available — engine cannot bootstrap an empirical distribution.");
  if (startingEquity <= 0) warnings.push("Non-positive starting equity — paths cannot grow.");
  if (riskPerTradePct <= 0) warnings.push("Zero risk-per-trade — equity stays flat by construction.");

  // ── empty/degenerate case: return zero result with warnings ──
  if (rCount === 0 || startingEquity <= 0 || riskPerTradePct <= 0) {
    return emptyResult({ trials, horizon, startingEquity, riskPerTradePct, ruinDrawdownPct, rCount, seed }, warnings);
  }

  const rng = mulberry32(seed);

  // ── pre-allocate path matrix: [trial][step]. step 0 = startingEquity. ──
  const paths: number[][] = new Array(trials);
  const terminals = new Float64Array(trials);
  const drawdowns = new Float64Array(trials);
  let ruinCount = 0;
  let profitCount = 0;

  // empirical baseline (drift used for the "expected terminal" reference)
  const avgR = avg(rMultiples);

  for (let t = 0; t < trials; t++) {
    const path = new Array<number>(horizon + 1);
    path[0] = startingEquity;
    let equity = startingEquity;
    let peak = equity;
    let maxDdPct = 0;
    let touchedRuin = false;
    for (let step = 1; step <= horizon; step++) {
      const r = rMultiples[Math.floor(rng() * rCount)];
      const riskDollars = equity * (riskPerTradePct / 100);
      equity = equity + r * riskDollars;
      if (equity < 0) equity = 0; // clip — can't go below zero in paper
      if (equity > peak) peak = equity;
      const ddPct = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
      if (ddPct > maxDdPct) maxDdPct = ddPct;
      if (!touchedRuin && ddPct >= ruinDrawdownPct) touchedRuin = true;
      path[step] = equity;
    }
    paths[t] = path;
    terminals[t] = equity;
    drawdowns[t] = maxDdPct;
    if (touchedRuin) ruinCount++;
    if (equity > startingEquity) profitCount++;
  }

  // ── terminal equity distribution ──
  const sortedTerm = Float64Array.from(terminals).sort();
  const meanTerm = avg(Array.from(terminals));
  const stdTerm = std(Array.from(terminals), meanTerm);
  const terminalEquity = {
    p5: round2(percentile(sortedTerm, 5)),
    p25: round2(percentile(sortedTerm, 25)),
    p50: round2(percentile(sortedTerm, 50)),
    p75: round2(percentile(sortedTerm, 75)),
    p95: round2(percentile(sortedTerm, 95)),
    mean: round2(meanTerm),
    std: round2(stdTerm),
    min: round2(sortedTerm[0]),
    max: round2(sortedTerm[sortedTerm.length - 1]),
  };

  // ── total return distribution ──
  const returns = Array.from(terminals).map((e) => ((e - startingEquity) / startingEquity) * 100);
  const sortedReturns = Float64Array.from(returns).sort();
  const totalReturnPct = {
    p5: round3(percentile(sortedReturns, 5)),
    p25: round3(percentile(sortedReturns, 25)),
    p50: round3(percentile(sortedReturns, 50)),
    p75: round3(percentile(sortedReturns, 75)),
    p95: round3(percentile(sortedReturns, 95)),
    mean: round3(avg(returns)),
  };

  // ── max drawdown distribution ──
  const sortedDd = Float64Array.from(drawdowns).sort();
  const maxDrawdownPct = {
    p5: round3(percentile(sortedDd, 5)),
    p25: round3(percentile(sortedDd, 25)),
    p50: round3(percentile(sortedDd, 50)),
    p75: round3(percentile(sortedDd, 75)),
    p95: round3(percentile(sortedDd, 95)),
    mean: round3(avg(Array.from(drawdowns))),
    worst: round3(sortedDd[sortedDd.length - 1]),
  };

  // ── envelope per timestep ──
  const envelope: EnvelopePoint[] = new Array(horizon + 1);
  const buf = new Float64Array(trials);
  for (let step = 0; step <= horizon; step++) {
    for (let t = 0; t < trials; t++) buf[t] = paths[t][step];
    const sorted = Float64Array.from(buf).sort();
    envelope[step] = {
      step,
      p5: round2(percentile(sorted, 5)),
      p25: round2(percentile(sorted, 25)),
      p50: round2(percentile(sorted, 50)),
      p75: round2(percentile(sorted, 75)),
      p95: round2(percentile(sorted, 95)),
      mean: round2(avg(Array.from(sorted))),
    };
  }

  // ── sample paths (downsample timesteps for plotting if very long) ──
  const stride = Math.max(1, Math.floor(horizon / 200));
  const sampleCount = Math.min(samplePathsTarget, trials);
  const samplePaths: number[][] = [];
  for (let i = 0; i < sampleCount; i++) {
    const idx = Math.floor((i * trials) / Math.max(1, sampleCount));
    const p = paths[Math.min(trials - 1, idx)];
    const compact: number[] = [];
    for (let s = 0; s <= horizon; s += stride) compact.push(round2(p[s]));
    if (compact[compact.length - 1] !== round2(p[horizon])) compact.push(round2(p[horizon]));
    samplePaths.push(compact);
  }

  // ── CVaR @ 95 on terminal returns ──
  const tailN = Math.max(1, Math.floor(returns.length * 0.05));
  const tailMean = avg(Array.from(sortedReturns).slice(0, tailN));
  const expectedShortfallPct = round3(tailMean);

  // ── empirical reference for the user ──
  const expectancyPerTradeDollars = avgR != null ? avgR * (startingEquity * riskPerTradePct / 100) : null;
  const expectedTerminalEquity =
    expectancyPerTradeDollars != null
      ? round2(startingEquity + expectancyPerTradeDollars * horizon)
      : null;

  // ── data-health warnings ──
  if (rCount < 10) warnings.push(`Only ${rCount} historical R-multiples — bootstrap variance is high. Need more closed trades for stable percentiles.`);
  if (rCount < 30) warnings.push("Distribution still narrow at <30 trades — tail estimates (p5/p95, CVaR) should be interpreted with care.");

  return {
    config: {
      trials,
      horizon,
      startingEquity,
      riskPerTradePct,
      ruinDrawdownPct,
      rMultiplesCount: rCount,
      seed,
    },
    empirical: {
      avgR: avgR == null ? null : round3(avgR),
      expectancyPerTradeDollars: expectancyPerTradeDollars == null ? null : round2(expectancyPerTradeDollars),
      expectedTerminalEquity,
    },
    terminalEquity,
    totalReturnPct,
    maxDrawdownPct,
    probabilityOfProfit: round3(profitCount / trials),
    probabilityOfRuin: round3(ruinCount / trials),
    expectedShortfallPct,
    envelope,
    samplePaths,
    warnings,
  };
}

// ───────────────────────────────────────────────────────────────────── helpers

function emptyResult(
  cfg: { trials: number; horizon: number; startingEquity: number; riskPerTradePct: number; ruinDrawdownPct: number; rCount: number; seed: number },
  warnings: string[],
): MonteCarloResult {
  const zero: PercentileBand = { p5: cfg.startingEquity, p25: cfg.startingEquity, p50: cfg.startingEquity, p75: cfg.startingEquity, p95: cfg.startingEquity };
  return {
    config: {
      trials: cfg.trials,
      horizon: cfg.horizon,
      startingEquity: cfg.startingEquity,
      riskPerTradePct: cfg.riskPerTradePct,
      ruinDrawdownPct: cfg.ruinDrawdownPct,
      rMultiplesCount: cfg.rCount,
      seed: cfg.seed,
    },
    empirical: { avgR: null, expectancyPerTradeDollars: null, expectedTerminalEquity: null },
    terminalEquity: { ...zero, mean: cfg.startingEquity, std: 0, min: cfg.startingEquity, max: cfg.startingEquity },
    totalReturnPct: { p5: 0, p25: 0, p50: 0, p75: 0, p95: 0, mean: 0 },
    maxDrawdownPct: { p5: 0, p25: 0, p50: 0, p75: 0, p95: 0, mean: 0, worst: 0 },
    probabilityOfProfit: 0,
    probabilityOfRuin: 0,
    expectedShortfallPct: null,
    envelope: [],
    samplePaths: [],
    warnings,
  };
}

function percentile(sorted: Float64Array | ArrayLike<number>, p: number): number {
  const n = (sorted as { length: number }).length;
  if (n === 0) return 0;
  if (n === 1) return (sorted as ArrayLike<number>)[0];
  const idx = Math.max(0, Math.min(n - 1, Math.round((p / 100) * (n - 1))));
  return (sorted as ArrayLike<number>)[idx];
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function std(xs: number[], mean: number): number {
  if (xs.length < 2) return 0;
  let s = 0;
  for (const x of xs) s += (x - mean) ** 2;
  return Math.sqrt(s / (xs.length - 1));
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
function round3(n: number): number { return Math.round(n * 1000) / 1000; }
