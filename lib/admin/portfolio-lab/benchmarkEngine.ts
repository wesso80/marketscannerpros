/**
 * lib/admin/portfolio-lab/benchmarkEngine.ts
 *
 * Captures ARCA equity vs benchmark (default SPY) and persists a row
 * into arca_benchmark_snapshots. Pulls SPY through the existing
 * marketData/index.ts cache (no extra AV calls outside the normal cache
 * window).
 */

import { q } from "@/lib/db";
import { getQuote } from "@/lib/marketData/index";
import type { ArcaPortfolio } from "./types";

export interface BenchmarkSnapshotResult {
  ok: boolean;
  benchmarkSymbol: string;
  benchmarkValue: number | null;
  benchmarkReturnPct: number | null;
  arcaReturnPct: number;
  relativePerformancePct: number | null;
  reason?: string;
}

export interface CaptureBenchmarkInput {
  portfolio: ArcaPortfolio;
  benchmarkSymbol?: string;
}

export async function captureBenchmarkSnapshot(input: CaptureBenchmarkInput): Promise<BenchmarkSnapshotResult> {
  const symbol = (input.benchmarkSymbol || input.portfolio.settings.benchmarkSymbol || "SPY").toUpperCase();
  const env = await getQuote(symbol).catch(() => null);
  const price = env?.data?.price ?? null;
  const arcaReturnPct =
    input.portfolio.startingBalance > 0
      ? ((input.portfolio.totalEquity - input.portfolio.startingBalance) / input.portfolio.startingBalance) * 100
      : 0;

  if (!price || !Number.isFinite(price)) {
    return {
      ok: false,
      benchmarkSymbol: symbol,
      benchmarkValue: null,
      benchmarkReturnPct: null,
      arcaReturnPct: round3(arcaReturnPct),
      relativePerformancePct: null,
      reason: "benchmark_quote_unavailable",
    };
  }

  // Find first benchmark snapshot for this portfolio to compute % return.
  const first = await q<{ benchmark_value: string }>(
    `SELECT benchmark_value FROM arca_benchmark_snapshots
      WHERE workspace_id=$1 AND portfolio_id=$2 AND benchmark_symbol=$3
      ORDER BY snapshot_at ASC LIMIT 1`,
    [input.portfolio.workspaceId, input.portfolio.id, symbol],
  );
  const baseline = first[0] ? Number(first[0].benchmark_value) : price;
  const benchmarkReturnPct = baseline > 0 ? ((price - baseline) / baseline) * 100 : 0;
  const relative = arcaReturnPct - benchmarkReturnPct;

  await q(
    `INSERT INTO arca_benchmark_snapshots
       (workspace_id, portfolio_id, benchmark_symbol, benchmark_value,
        benchmark_return_pct, arca_return_pct, relative_performance_pct)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      input.portfolio.workspaceId,
      input.portfolio.id,
      symbol,
      price,
      round4(benchmarkReturnPct),
      round4(arcaReturnPct),
      round4(relative),
    ],
  );

  return {
    ok: true,
    benchmarkSymbol: symbol,
    benchmarkValue: price,
    benchmarkReturnPct: round4(benchmarkReturnPct),
    arcaReturnPct: round4(arcaReturnPct),
    relativePerformancePct: round4(relative),
  };
}

export async function listBenchmarkSnapshots(
  workspaceId: string,
  portfolioId: string,
  opts: { symbol?: string; limit?: number } = {},
): Promise<Array<{
  snapshotAt: string;
  benchmarkSymbol: string;
  benchmarkValue: number;
  benchmarkReturnPct: number | null;
  arcaReturnPct: number | null;
  relativePerformancePct: number | null;
}>> {
  const limit = Math.min(opts.limit ?? 365, 1000);
  const rows = await q<{
    snapshot_at: string;
    benchmark_symbol: string;
    benchmark_value: string;
    benchmark_return_pct: string | null;
    arca_return_pct: string | null;
    relative_performance_pct: string | null;
  }>(
    `SELECT snapshot_at, benchmark_symbol, benchmark_value, benchmark_return_pct,
            arca_return_pct, relative_performance_pct
       FROM arca_benchmark_snapshots
      WHERE workspace_id=$1 AND portfolio_id=$2
        ${opts.symbol ? "AND benchmark_symbol=$3" : ""}
      ORDER BY snapshot_at DESC LIMIT ${limit}`,
    opts.symbol ? [workspaceId, portfolioId, opts.symbol.toUpperCase()] : [workspaceId, portfolioId],
  );
  return rows.map((r) => ({
    snapshotAt: r.snapshot_at,
    benchmarkSymbol: r.benchmark_symbol,
    benchmarkValue: Number(r.benchmark_value),
    benchmarkReturnPct: r.benchmark_return_pct == null ? null : Number(r.benchmark_return_pct),
    arcaReturnPct: r.arca_return_pct == null ? null : Number(r.arca_return_pct),
    relativePerformancePct: r.relative_performance_pct == null ? null : Number(r.relative_performance_pct),
  }));
}

function round3(n: number): number { return Math.round(n * 1000) / 1000; }
function round4(n: number): number { return Math.round(n * 10000) / 10000; }
