/**
 * lib/admin/portfolio-lab/correlationEngine.ts
 *
 * Pure correlation math for ARCA's open positions. No DB, no network —
 * caller hands in a price series per symbol plus the position metadata
 * and gets back an n × n Pearson matrix, top-correlated pairs, average
 * pairwise correlation, an effective-N estimate, and per-pair
 * directional concentration scores.
 *
 * Directional concentration:
 *   - Same side  (LONG+LONG or SHORT+SHORT) and corr > 0 → concentrated
 *   - Same side and corr < 0                            → diversified
 *   - Opposite sides and corr > 0                       → hedged
 *   - Opposite sides and corr < 0                       → concentrated
 * Score = (sameSide ? +pearson : -pearson). High = concentrated.
 *
 * Returns are computed only on dates where BOTH symbols have an
 * observation — handles crypto (7-day) / equity (5-day) calendar
 * mismatches without fabricating data.
 */

// ────────────────────────────────────────────────────────── types

export interface CorrelationPositionInput {
  positionId: string;
  symbol: string;
  assetClass: string;
  side: "LONG" | "SHORT";
  notional: number;
  /** Map<YYYY-MM-DD, price> — at least 2 entries required for a return. */
  prices: Map<string, number>;
}

export interface CorrelationEngineInput {
  positions: CorrelationPositionInput[];
  /** Minimum overlapping daily returns required to emit a Pearson. Default 10. */
  minPaired?: number;
}

export interface SymbolStats {
  positionId: string;
  symbol: string;
  assetClass: string;
  side: "LONG" | "SHORT";
  notional: number;
  observations: number;     // distinct prices
  meanReturnPct: number | null;
  volatilityPct: number | null;   // daily stdev × 100
}

export interface PairResult {
  symbolA: string;
  symbolB: string;
  positionIdA: string;
  positionIdB: string;
  pearson: number | null;
  paired: number;
  concentrationScore: number | null;   // sameSide ? +r : -r
  flag: "concentrated" | "hedged" | "diversified" | "neutral" | "insufficient";
}

export interface CorrelationResult {
  asOf: string;
  symbols: SymbolStats[];
  /** n × n matrix. matrix[i][j] is null when paired observations < minPaired. */
  matrix: (number | null)[][];
  pairs: PairResult[];                  // unique pairs only (i < j), full list
  topAbs: PairResult[];                 // up to 5 pairs by |pearson|
  averagePairwise: number | null;       // mean of defined pearson over unique pairs
  effectiveN: number | null;            // equal-weight effective number of positions
  portfolioConcentration: number | null; // mean of concentrationScore over unique pairs
  warnings: string[];
}

// ────────────────────────────────────────────────────────── engine

export function computeCorrelations(input: CorrelationEngineInput): CorrelationResult {
  const minPaired = Math.max(2, input.minPaired ?? 10);
  const warnings: string[] = [];

  // Snapshot order matters for the matrix layout. Keep input order.
  const symbols: SymbolStats[] = input.positions.map((p) => {
    const seriesDates = Array.from(p.prices.keys()).sort();
    const returns: number[] = [];
    for (let i = 1; i < seriesDates.length; i++) {
      const a = p.prices.get(seriesDates[i - 1])!;
      const b = p.prices.get(seriesDates[i])!;
      if (a > 0 && Number.isFinite(a) && Number.isFinite(b)) {
        returns.push((b - a) / a);
      }
    }
    const m = returns.length > 0 ? avg(returns) : null;
    const v = returns.length >= 2 ? Math.sqrt(variance(returns, m!)) : null;
    return {
      positionId: p.positionId,
      symbol: p.symbol,
      assetClass: p.assetClass,
      side: p.side,
      notional: p.notional,
      observations: p.prices.size,
      meanReturnPct: m == null ? null : round3(m * 100),
      volatilityPct: v == null ? null : round3(v * 100),
    };
  });

  const n = input.positions.length;
  if (n === 0) {
    return {
      asOf: new Date().toISOString(),
      symbols,
      matrix: [],
      pairs: [],
      topAbs: [],
      averagePairwise: null,
      effectiveN: null,
      portfolioConcentration: null,
      warnings: ["No open positions to correlate."],
    };
  }

  if (n === 1) {
    warnings.push("Only one open position — correlation requires at least 2.");
  }

  // ── Pairwise Pearson on intersected date sets ──
  const matrix: (number | null)[][] = Array.from({ length: n }, () => new Array<number | null>(n).fill(null));
  for (let i = 0; i < n; i++) matrix[i][i] = 1;

  const pairs: PairResult[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = input.positions[i];
      const b = input.positions[j];
      const { pearson, paired } = pairwise(a.prices, b.prices, minPaired);
      matrix[i][j] = pearson;
      matrix[j][i] = pearson;
      const sameSide = a.side === b.side;
      const concentrationScore = pearson == null ? null : sameSide ? pearson : -pearson;
      const flag: PairResult["flag"] =
        pearson == null ? "insufficient"
        : Math.abs(pearson) < 0.3 ? "neutral"
        : sameSide && pearson >= 0.7 ? "concentrated"
        : !sameSide && pearson >= 0.7 ? "hedged"
        : sameSide && pearson <= -0.7 ? "diversified"
        : !sameSide && pearson <= -0.7 ? "concentrated"
        : pearson > 0 ? (sameSide ? "concentrated" : "hedged")
        : sameSide ? "diversified" : "concentrated";
      pairs.push({
        symbolA: a.symbol,
        symbolB: b.symbol,
        positionIdA: a.positionId,
        positionIdB: b.positionId,
        pearson: pearson == null ? null : round3(pearson),
        paired,
        concentrationScore: concentrationScore == null ? null : round3(concentrationScore),
        flag,
      });
    }
  }

  // ── summary stats ──
  const defined = pairs.filter((p) => p.pearson != null) as Array<PairResult & { pearson: number }>;
  const averagePairwise = defined.length > 0 ? avg(defined.map((p) => p.pearson)) : null;
  const concDefined = pairs.filter((p) => p.concentrationScore != null) as Array<PairResult & { concentrationScore: number }>;
  const portfolioConcentration = concDefined.length > 0 ? avg(concDefined.map((p) => p.concentrationScore)) : null;

  // Equal-weight effective number of positions:
  //   eff_n = n / (1 + (n-1) * avgPairwise)
  // Bounded to [1, n]. When avg correlation is high, eff_n collapses.
  let effectiveN: number | null = null;
  if (n >= 2 && averagePairwise != null) {
    const denom = 1 + (n - 1) * averagePairwise;
    if (denom > 0) effectiveN = Math.max(1, Math.min(n, n / denom));
  }

  // ── top-|r| pairs ──
  const topAbs = [...defined]
    .sort((a, b) => Math.abs(b.pearson) - Math.abs(a.pearson))
    .slice(0, 5);

  // ── warnings ──
  const insufficient = pairs.filter((p) => p.pearson == null).length;
  if (insufficient > 0) {
    warnings.push(`${insufficient} pair${insufficient === 1 ? "" : "s"} lack ${minPaired}+ overlapping daily observations; shown as "—".`);
  }
  const concentratedCount = pairs.filter((p) => p.flag === "concentrated").length;
  if (concentratedCount > 0) {
    warnings.push(`${concentratedCount} pair${concentratedCount === 1 ? "" : "s"} flagged as directionally concentrated (|r| ≥ 0.7 and same effective bet).`);
  }

  return {
    asOf: new Date().toISOString(),
    symbols,
    matrix,
    pairs,
    topAbs,
    averagePairwise: averagePairwise == null ? null : round3(averagePairwise),
    effectiveN: effectiveN == null ? null : round3(effectiveN),
    portfolioConcentration: portfolioConcentration == null ? null : round3(portfolioConcentration),
    warnings,
  };
}

// ────────────────────────────────────────────────────────── primitives

export function pairwise(
  pricesA: Map<string, number>,
  pricesB: Map<string, number>,
  minPaired: number,
): { pearson: number | null; paired: number } {
  // Dates present in BOTH series, sorted.
  const dates: string[] = [];
  for (const d of pricesA.keys()) if (pricesB.has(d)) dates.push(d);
  dates.sort();
  if (dates.length < minPaired + 1) return { pearson: null, paired: dates.length };

  const rA: number[] = [];
  const rB: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    const pa0 = pricesA.get(dates[i - 1])!;
    const pa1 = pricesA.get(dates[i])!;
    const pb0 = pricesB.get(dates[i - 1])!;
    const pb1 = pricesB.get(dates[i])!;
    if (pa0 > 0 && pb0 > 0 && Number.isFinite(pa1) && Number.isFinite(pb1)) {
      rA.push((pa1 - pa0) / pa0);
      rB.push((pb1 - pb0) / pb0);
    }
  }
  if (rA.length < minPaired) return { pearson: null, paired: rA.length };

  const mA = avg(rA), mB = avg(rB);
  let cov = 0, varA = 0, varB = 0;
  for (let i = 0; i < rA.length; i++) {
    cov += (rA[i] - mA) * (rB[i] - mB);
    varA += (rA[i] - mA) ** 2;
    varB += (rB[i] - mB) ** 2;
  }
  if (varA <= 0 || varB <= 0) return { pearson: null, paired: rA.length };
  const r = cov / Math.sqrt(varA * varB);
  // Numerical clamp — Pearson is mathematically bounded to [-1, 1].
  return { pearson: Math.max(-1, Math.min(1, r)), paired: rA.length };
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function variance(xs: number[], mean: number): number {
  if (xs.length < 2) return 0;
  let s = 0;
  for (const x of xs) s += (x - mean) ** 2;
  return s / (xs.length - 1);
}

function round3(n: number): number { return Math.round(n * 1000) / 1000; }
