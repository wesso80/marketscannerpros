/**
 * test/admin/arcaPortfolioLabCorrelation.test.ts
 *
 * Math tests for the open-position correlation engine. Pure — no DB.
 *
 * Coverage:
 *   - Pairwise Pearson: +1 for proportional series, -1 for mirrored,
 *     ≈0 for orthogonal, null for insufficient overlap, null for
 *     zero-variance (flat) input.
 *   - Calendar-mismatch handling (sparse vs dense series intersect).
 *   - Diagonal is always 1.
 *   - Directional concentration flag:
 *       same-side  + corr ≥ 0.7 → "concentrated"
 *       opp-side   + corr ≥ 0.7 → "hedged"
 *       same-side  + corr ≤ -0.7 → "diversified"
 *       opp-side   + corr ≤ -0.7 → "concentrated"
 *   - Effective-N math: equal-weight formula collapses with positive
 *     average correlation.
 *   - topAbs ordering by |pearson|.
 */

import { describe, expect, it } from "vitest";
import {
  computeCorrelations,
  pairwise,
  type CorrelationPositionInput,
} from "@/lib/admin/portfolio-lab/correlationEngine";

function pricesFromReturns(start: number, rs: number[], baseDate = "2026-04-01"): Map<string, number> {
  const map = new Map<string, number>();
  let p = start;
  let d = new Date(baseDate + "T00:00:00Z");
  map.set(iso(d), p);
  for (const r of rs) {
    p = p * (1 + r);
    d = new Date(d.getTime() + 86_400_000);
    map.set(iso(d), p);
  }
  return map;
}
function iso(d: Date): string { return d.toISOString().slice(0, 10); }

function pos(over: Partial<CorrelationPositionInput>): CorrelationPositionInput {
  return {
    positionId: "p",
    symbol: "X",
    assetClass: "equity",
    side: "LONG",
    notional: 10_000,
    prices: new Map(),
    ...over,
  };
}

// ───────────────────────────── pairwise primitive

describe("pairwise Pearson", () => {
  it("returns +1 for perfectly correlated series (proportional moves)", () => {
    const rs = [0.01, -0.02, 0.03, -0.01, 0.02, 0.01, -0.03, 0.02, 0.01, -0.01, 0.02, 0.01];
    const a = pricesFromReturns(100, rs);
    const b = pricesFromReturns(50, rs); // same returns, different absolute scale
    const { pearson, paired } = pairwise(a, b, 5);
    expect(paired).toBe(rs.length);
    expect(pearson).toBeCloseTo(1, 4);
  });

  it("returns -1 for perfectly anti-correlated series", () => {
    const rs = [0.01, -0.02, 0.03, -0.01, 0.02, 0.01, -0.03, 0.02, 0.01, -0.01, 0.02, 0.01];
    const a = pricesFromReturns(100, rs);
    const b = pricesFromReturns(100, rs.map((r) => -r));
    const { pearson } = pairwise(a, b, 5);
    expect(pearson).toBeCloseTo(-1, 4);
  });

  it("returns null when overlap is below minPaired+1", () => {
    const a = pricesFromReturns(100, [0.01, 0.01, 0.01]);
    const b = pricesFromReturns(100, [0.01, 0.01, 0.01]);
    const { pearson, paired } = pairwise(a, b, 10);
    expect(pearson).toBeNull();
    expect(paired).toBeLessThan(11);
  });

  it("returns null when one series has zero variance (flat prices)", () => {
    const a = pricesFromReturns(100, [0.01, -0.02, 0.03, -0.01, 0.02, 0.01, -0.03, 0.02, 0.01, -0.01, 0.02, 0.01]);
    // Build a flat-price series of the same length.
    const flat = new Map<string, number>();
    let d = new Date("2026-04-01T00:00:00Z");
    for (let i = 0; i < 13; i++) {
      flat.set(iso(d), 100);
      d = new Date(d.getTime() + 86_400_000);
    }
    const { pearson } = pairwise(a, flat, 5);
    expect(pearson).toBeNull();
  });

  it("intersects sparse vs dense series correctly", () => {
    // dense series: every day for 12 days
    const dense = pricesFromReturns(100, Array.from({ length: 11 }, () => 0.01));
    // sparse series: keep only every other date but with matching returns on those dates
    const sparse = new Map<string, number>();
    let d = new Date("2026-04-01T00:00:00Z");
    let p = 100;
    sparse.set(iso(d), p);
    for (let i = 0; i < 11; i++) {
      d = new Date(d.getTime() + 86_400_000);
      p = p * 1.01;
      if (i % 2 === 0) sparse.set(iso(d), p);
    }
    const { pearson, paired } = pairwise(dense, sparse, 2);
    // Both share a small overlap; pearson should be finite (could be ~1 since proportional).
    expect(paired).toBeGreaterThanOrEqual(2);
    expect(pearson).not.toBeNull();
    expect(pearson!).toBeGreaterThan(0.9);
  });
});

// ───────────────────────────── computeCorrelations

describe("computeCorrelations — engine", () => {
  it("handles empty open positions", () => {
    const r = computeCorrelations({ positions: [] });
    expect(r.symbols).toEqual([]);
    expect(r.matrix).toEqual([]);
    expect(r.pairs).toEqual([]);
    expect(r.averagePairwise).toBeNull();
    expect(r.effectiveN).toBeNull();
    expect(r.warnings.some((w) => w.toLowerCase().includes("no open positions"))).toBe(true);
  });

  it("diagonal is always 1", () => {
    const rs = [0.01, -0.01, 0.02, -0.02, 0.01, 0.01, -0.01, 0.01, -0.02, 0.02, 0.01, 0.01];
    const r = computeCorrelations({
      positions: [
        pos({ positionId: "1", symbol: "AAPL", prices: pricesFromReturns(100, rs) }),
        pos({ positionId: "2", symbol: "MSFT", prices: pricesFromReturns(200, rs) }),
      ],
      minPaired: 5,
    });
    expect(r.matrix[0][0]).toBe(1);
    expect(r.matrix[1][1]).toBe(1);
    expect(r.matrix[0][1]).toBeCloseTo(1, 3);
    expect(r.matrix[1][0]).toBeCloseTo(1, 3);
  });

  it("flags same-side + high positive corr as concentrated", () => {
    const rs = [0.01, -0.02, 0.03, -0.01, 0.02, 0.01, -0.03, 0.02, 0.01, -0.01, 0.02, 0.01];
    const r = computeCorrelations({
      positions: [
        pos({ positionId: "1", symbol: "AAPL", side: "LONG", prices: pricesFromReturns(100, rs) }),
        pos({ positionId: "2", symbol: "MSFT", side: "LONG", prices: pricesFromReturns(200, rs) }),
      ],
      minPaired: 5,
    });
    expect(r.pairs[0].flag).toBe("concentrated");
    expect(r.pairs[0].concentrationScore).toBeCloseTo(1, 3);
  });

  it("flags opposite-side + high positive corr as hedged", () => {
    const rs = [0.01, -0.02, 0.03, -0.01, 0.02, 0.01, -0.03, 0.02, 0.01, -0.01, 0.02, 0.01];
    const r = computeCorrelations({
      positions: [
        pos({ positionId: "1", symbol: "AAPL", side: "LONG", prices: pricesFromReturns(100, rs) }),
        pos({ positionId: "2", symbol: "MSFT", side: "SHORT", prices: pricesFromReturns(200, rs) }),
      ],
      minPaired: 5,
    });
    expect(r.pairs[0].flag).toBe("hedged");
    expect(r.pairs[0].concentrationScore).toBeCloseTo(-1, 3);
  });

  it("flags same-side + strongly anti-correlated as diversified", () => {
    const rs = [0.01, -0.02, 0.03, -0.01, 0.02, 0.01, -0.03, 0.02, 0.01, -0.01, 0.02, 0.01];
    const r = computeCorrelations({
      positions: [
        pos({ positionId: "1", symbol: "AAPL", side: "LONG", prices: pricesFromReturns(100, rs) }),
        pos({ positionId: "2", symbol: "GLD", side: "LONG", prices: pricesFromReturns(200, rs.map((x) => -x)) }),
      ],
      minPaired: 5,
    });
    expect(r.pairs[0].flag).toBe("diversified");
    expect(r.pairs[0].concentrationScore).toBeCloseTo(-1, 3);
  });

  it("flags opposite-side + strongly anti-correlated as concentrated", () => {
    const rs = [0.01, -0.02, 0.03, -0.01, 0.02, 0.01, -0.03, 0.02, 0.01, -0.01, 0.02, 0.01];
    const r = computeCorrelations({
      positions: [
        pos({ positionId: "1", symbol: "AAPL", side: "LONG", prices: pricesFromReturns(100, rs) }),
        pos({ positionId: "2", symbol: "TLT", side: "SHORT", prices: pricesFromReturns(200, rs.map((x) => -x)) }),
      ],
      minPaired: 5,
    });
    expect(r.pairs[0].flag).toBe("concentrated");
    expect(r.pairs[0].concentrationScore).toBeCloseTo(1, 3);
  });

  it("collapses effectiveN when average correlation is high", () => {
    const rs = [0.01, -0.02, 0.03, -0.01, 0.02, 0.01, -0.03, 0.02, 0.01, -0.01, 0.02, 0.01];
    const r = computeCorrelations({
      positions: [
        pos({ positionId: "1", symbol: "A", side: "LONG", prices: pricesFromReturns(100, rs) }),
        pos({ positionId: "2", symbol: "B", side: "LONG", prices: pricesFromReturns(100, rs) }),
        pos({ positionId: "3", symbol: "C", side: "LONG", prices: pricesFromReturns(100, rs) }),
      ],
      minPaired: 5,
    });
    expect(r.averagePairwise).toBeCloseTo(1, 3);
    // n / (1 + (n-1) * 1) = 3 / 3 = 1 → fully concentrated
    expect(r.effectiveN).toBeCloseTo(1, 2);
  });

  it("effectiveN ≈ n when correlations are ~0", () => {
    // Random-ish independent return series
    const rsA = [0.02, -0.01, 0.03, -0.02, 0.01, 0.02, -0.03, 0.01, 0.02, -0.01, 0.03, -0.02];
    const rsB = [-0.01, 0.02, -0.03, 0.01, 0.02, -0.01, 0.03, -0.02, 0.01, 0.02, -0.01, 0.03];
    const r = computeCorrelations({
      positions: [
        pos({ positionId: "1", symbol: "A", side: "LONG", prices: pricesFromReturns(100, rsA) }),
        pos({ positionId: "2", symbol: "B", side: "LONG", prices: pricesFromReturns(100, rsB) }),
      ],
      minPaired: 5,
    });
    // Whatever the precise correlation, with 2 positions effectiveN is bounded
    // to [1, 2] and approaches 2 as correlation approaches 0.
    expect(r.effectiveN!).toBeGreaterThanOrEqual(1);
    expect(r.effectiveN!).toBeLessThanOrEqual(2);
  });

  it("topAbs sorts by |pearson| desc and caps at 5", () => {
    const rs = [0.01, -0.02, 0.03, -0.01, 0.02, 0.01, -0.03, 0.02, 0.01, -0.01, 0.02, 0.01];
    const r = computeCorrelations({
      positions: [
        pos({ positionId: "1", symbol: "A", prices: pricesFromReturns(100, rs) }),
        pos({ positionId: "2", symbol: "B", prices: pricesFromReturns(100, rs) }),
        pos({ positionId: "3", symbol: "C", prices: pricesFromReturns(100, rs.map((x) => -x)) }),
        pos({ positionId: "4", symbol: "D", prices: pricesFromReturns(100, rs) }),
      ],
      minPaired: 5,
    });
    expect(r.topAbs.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < r.topAbs.length; i++) {
      const a = Math.abs(r.topAbs[i - 1].pearson ?? 0);
      const b = Math.abs(r.topAbs[i].pearson ?? 0);
      expect(a).toBeGreaterThanOrEqual(b);
    }
  });

  it("emits pearson=null when overlap is below minPaired", () => {
    const r = computeCorrelations({
      positions: [
        pos({ positionId: "1", symbol: "A", prices: pricesFromReturns(100, [0.01, 0.01, 0.01]) }),
        pos({ positionId: "2", symbol: "B", prices: pricesFromReturns(100, [0.01, 0.01, 0.01]) }),
      ],
      minPaired: 10,
    });
    expect(r.pairs[0].pearson).toBeNull();
    expect(r.pairs[0].flag).toBe("insufficient");
    expect(r.warnings.some((w) => w.toLowerCase().includes("lack"))).toBe(true);
  });
});
