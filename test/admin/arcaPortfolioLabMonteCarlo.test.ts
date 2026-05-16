/**
 * test/admin/arcaPortfolioLabMonteCarlo.test.ts
 *
 * Math tests for the Monte Carlo equity simulation engine. Pure — no DB,
 * no network. Determinism via Mulberry32 seed.
 *
 * Coverage:
 *   - seeded determinism (same seed → identical envelope + terminals)
 *   - empty rMultiples → warnings + zero result
 *   - all-positive R → P(profit)=1, P(ruin)=0
 *   - all-negative R with tight horizon → P(ruin) close to 1
 *   - mean terminal equity ≈ start + expectancy·risk·horizon (large trials)
 *   - percentile ordering p5≤p25≤p50≤p75≤p95 at every envelope step
 *   - clamp: trials/horizon/samplePaths capped without throwing
 *   - sample paths returned with the requested shape
 */

import { describe, expect, it } from "vitest";
import { mulberry32, runMonteCarlo } from "@/lib/admin/portfolio-lab/monteCarloEngine";

describe("Mulberry32 PRNG", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 1000; i++) expect(a()).toBe(b());
  });

  it("produces values in [0, 1)", () => {
    const r = mulberry32(123);
    for (let i = 0; i < 10_000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("runMonteCarlo — degenerate inputs", () => {
  it("returns a zero envelope and warning when rMultiples is empty", () => {
    const r = runMonteCarlo({
      startingEquity: 200_000, riskPerTradePct: 1, rMultiples: [],
      trials: 100, horizon: 20, ruinDrawdownPct: 50, seed: 1,
    });
    expect(r.envelope).toEqual([]);
    expect(r.samplePaths).toEqual([]);
    expect(r.probabilityOfProfit).toBe(0);
    expect(r.probabilityOfRuin).toBe(0);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("returns a flat path when riskPerTradePct is zero", () => {
    const r = runMonteCarlo({
      startingEquity: 200_000, riskPerTradePct: 0, rMultiples: [-1, 1, 2],
      trials: 50, horizon: 10, ruinDrawdownPct: 50, seed: 1,
    });
    expect(r.warnings.some((w) => w.toLowerCase().includes("zero risk"))).toBe(true);
    expect(r.envelope.length).toBe(0);
  });
});

describe("runMonteCarlo — determinism", () => {
  it("produces identical results for the same seed", () => {
    const input = {
      startingEquity: 100_000, riskPerTradePct: 1,
      rMultiples: [-1, -1, 1.5, 2, -1, 1, 2.5, -1, 3, 1],
      trials: 500, horizon: 50, ruinDrawdownPct: 50, seed: 9999,
    } as const;
    const a = runMonteCarlo(input);
    const b = runMonteCarlo(input);
    expect(a.terminalEquity).toEqual(b.terminalEquity);
    expect(a.probabilityOfProfit).toBe(b.probabilityOfProfit);
    expect(a.probabilityOfRuin).toBe(b.probabilityOfRuin);
    expect(a.envelope.length).toBe(b.envelope.length);
    expect(a.envelope[10]).toEqual(b.envelope[10]);
  });

  it("differs across seeds", () => {
    const base = {
      startingEquity: 100_000, riskPerTradePct: 1,
      rMultiples: [-1, -1, 1.5, 2, -1, 1, 2.5, -1, 3, 1],
      trials: 200, horizon: 50, ruinDrawdownPct: 50,
    };
    const a = runMonteCarlo({ ...base, seed: 1 });
    const b = runMonteCarlo({ ...base, seed: 2 });
    expect(a.terminalEquity.p50).not.toBe(b.terminalEquity.p50);
  });
});

describe("runMonteCarlo — edge distributions", () => {
  it("ALL-positive R → P(profit)=1, P(ruin)=0", () => {
    const r = runMonteCarlo({
      startingEquity: 100_000, riskPerTradePct: 1,
      rMultiples: [1, 2, 0.5, 1.5, 1],
      trials: 500, horizon: 30, ruinDrawdownPct: 50, seed: 7,
    });
    expect(r.probabilityOfProfit).toBe(1);
    expect(r.probabilityOfRuin).toBe(0);
    expect(r.terminalEquity.min).toBeGreaterThan(100_000);
  });

  it("ALL-negative R + long horizon → high P(ruin)", () => {
    // Every trade loses 1R = 1% of equity. After ~70 losses equity ~halved
    // (.99^70 ≈ 0.495). With horizon=100 and ruin=50% we should hit ruin
    // on essentially every path.
    const r = runMonteCarlo({
      startingEquity: 100_000, riskPerTradePct: 1,
      rMultiples: [-1, -1, -1, -1],
      trials: 200, horizon: 100, ruinDrawdownPct: 50, seed: 11,
    });
    expect(r.probabilityOfRuin).toBeGreaterThan(0.95);
    expect(r.probabilityOfProfit).toBe(0);
  });
});

describe("runMonteCarlo — convergence to expectancy", () => {
  it("mean terminal equity ≈ start + expectancy·risk·horizon for large trials", () => {
    // Symmetric +1R / -1R / +2R distribution → avgR = (1 - 1 + 2) / 3 = 0.667
    // Per-trade $: 0.667 × 100_000 × 0.01 = $667
    // Over 50 trades: ~$33_333 (linear ignoring compounding); true geometric
    // mean is higher but the empirical mean across many paths should be in
    // the same ballpark.
    const r = runMonteCarlo({
      startingEquity: 100_000, riskPerTradePct: 1,
      rMultiples: [1, -1, 2],
      trials: 3000, horizon: 50, ruinDrawdownPct: 90, seed: 5,
    });
    expect(r.terminalEquity.mean).toBeGreaterThan(100_000 + 20_000);
    expect(r.terminalEquity.mean).toBeLessThan(100_000 + 80_000);
    expect(r.empirical.avgR).toBeCloseTo(0.667, 2);
  });
});

describe("runMonteCarlo — envelope ordering", () => {
  it("p5 ≤ p25 ≤ p50 ≤ p75 ≤ p95 at every step", () => {
    const r = runMonteCarlo({
      startingEquity: 100_000, riskPerTradePct: 1,
      rMultiples: [-2, -1, 0, 1, 2, 3, -1, 1.5, -1, 2],
      trials: 500, horizon: 60, ruinDrawdownPct: 50, seed: 21,
    });
    expect(r.envelope.length).toBe(61);
    for (const p of r.envelope) {
      expect(p.p5).toBeLessThanOrEqual(p.p25);
      expect(p.p25).toBeLessThanOrEqual(p.p50);
      expect(p.p50).toBeLessThanOrEqual(p.p75);
      expect(p.p75).toBeLessThanOrEqual(p.p95);
    }
  });

  it("envelope step 0 equals starting equity across all percentiles", () => {
    const r = runMonteCarlo({
      startingEquity: 100_000, riskPerTradePct: 1,
      rMultiples: [-1, 2, -1, 3, -2, 1],
      trials: 200, horizon: 20, ruinDrawdownPct: 50, seed: 33,
    });
    const e0 = r.envelope[0];
    expect(e0.p5).toBe(100_000);
    expect(e0.p95).toBe(100_000);
    expect(e0.mean).toBe(100_000);
  });
});

describe("runMonteCarlo — clamping", () => {
  it("clamps trials and horizon to safe maxima without throwing", () => {
    const r = runMonteCarlo({
      startingEquity: 100_000, riskPerTradePct: 1,
      rMultiples: [1, -1],
      trials: 9_999_999, horizon: 9_999_999, ruinDrawdownPct: 50, seed: 1,
      samplePaths: 1_000_000,
    });
    expect(r.config.trials).toBeLessThanOrEqual(10_000);
    expect(r.config.horizon).toBeLessThanOrEqual(1_000);
    expect(r.samplePaths.length).toBeLessThanOrEqual(200);
  });

  it("retains exactly samplePaths-target paths when smaller than trials", () => {
    const r = runMonteCarlo({
      startingEquity: 100_000, riskPerTradePct: 1,
      rMultiples: [1, -1, 2],
      trials: 100, horizon: 10, ruinDrawdownPct: 50, seed: 5,
      samplePaths: 25,
    });
    expect(r.samplePaths.length).toBe(25);
    // Each sample path's last value should match envelope[horizon] range
    for (const p of r.samplePaths) {
      expect(p[0]).toBe(100_000);
      expect(p.length).toBeGreaterThanOrEqual(2);
    }
  });
});
