/**
 * lib/admin/portfolio-lab/analyticsLoader.ts
 *
 * Thin DB-facing wrapper around analyticsEngine. Pulls the snapshots,
 * trades, open positions, and benchmark history for the workspace's
 * default ARCA portfolio, then hands them to computeAnalytics.
 *
 * Workspace-isolated. Admin-only via the calling route.
 */

import {
  getDefaultPortfolio,
  listOpenPositions,
  listSnapshots,
  listTrades,
} from "./portfolioStore";
import { listBenchmarkSnapshots } from "./benchmarkEngine";
import { ARCA_DEFAULT_PORTFOLIO_NAME } from "./constants";
import { computeAnalytics, type AnalyticsResult } from "./analyticsEngine";

export interface LoadAnalyticsOptions {
  workspaceId: string;
  /** Snapshot history depth. Default 365. */
  maxSnapshots?: number;
  /** Trade history depth. Default 1000. */
  maxTrades?: number;
}

export type AnalyticsLoad =
  | { ok: true; analytics: AnalyticsResult; benchmarkSymbol: string }
  | { ok: false; reason: "no_portfolio" };

export async function loadAnalytics(opts: LoadAnalyticsOptions): Promise<AnalyticsLoad> {
  const portfolio = await getDefaultPortfolio(opts.workspaceId, ARCA_DEFAULT_PORTFOLIO_NAME);
  if (!portfolio) return { ok: false, reason: "no_portfolio" };

  const [snapshots, trades, positions, benchSnaps] = await Promise.all([
    listSnapshots(opts.workspaceId, portfolio.id, { limit: opts.maxSnapshots ?? 365 }),
    listTrades(opts.workspaceId, portfolio.id, { limit: opts.maxTrades ?? 1000 }),
    listOpenPositions(opts.workspaceId, portfolio.id),
    listBenchmarkSnapshots(opts.workspaceId, portfolio.id, {
      symbol: portfolio.settings.benchmarkSymbol,
      limit: 365,
    }),
  ]);

  const analytics = computeAnalytics({
    startingBalance: portfolio.startingBalance,
    currentEquity: portfolio.totalEquity,
    inceptionAt: portfolio.createdAt,
    snapshots,
    trades,
    positions,
    benchmarkSnaps: benchSnaps,
    benchmarkSymbol: portfolio.settings.benchmarkSymbol,
    riskPerTradePct: portfolio.settings.riskPerTradePct,
    maxSingleTradeRiskPct: portfolio.settings.maxSingleTradeRiskPct,
  });

  return { ok: true, analytics, benchmarkSymbol: portfolio.settings.benchmarkSymbol };
}
