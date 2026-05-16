/**
 * lib/admin/portfolio-lab/performanceEngine.ts
 *
 * Pure functions over arca_portfolio_snapshots + arca_trades to derive
 * the performance metrics surfaced in the dashboard, reports, and
 * benchmark comparison.
 *
 * No DB writes. All metrics computed in-memory from already-stored data.
 */

import { listSnapshots, listTrades } from "./portfolioStore";
import type { ArcaPortfolioSnapshot, ArcaTrade } from "./types";

export interface PerformanceMetrics {
  // Equity
  startingBalance: number;
  currentEquity: number;
  totalReturnPct: number;          // (curr - start) / start * 100
  realisedPnl: number;
  unrealisedPnl: number;
  // Drawdown
  maxDrawdownPct: number;          // worst peak-to-trough on snapshot equity
  currentDrawdownPct: number;
  // Risk-adjusted (computed from daily snapshot returns)
  sharpe: number | null;           // annualised, rf=0
  sortino: number | null;          // annualised, downside-only
  volAnnualisedPct: number | null;
  // Trade stats
  closedTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRatePct: number | null;
  avgWinR: number | null;
  avgLossR: number | null;
  avgR: number | null;
  expectancyR: number | null;      // winRate*avgWinR - lossRate*|avgLossR|
  profitFactor: number | null;     // sum(wins$) / sum(|losses$|)
  largestWin: number;
  largestLoss: number;
  // Streaks
  currentWinStreak: number;
  currentLossStreak: number;
  longestWinStreak: number;
  longestLossStreak: number;
  // Diagnostics
  computedAt: string;
  basedOnSnapshots: number;
  basedOnTrades: number;
}

export interface PerformanceInput {
  workspaceId: string;
  portfolioId: string;
  startingBalance: number;
  currentEquity: number;
  realisedPnl: number;
  unrealisedPnl: number;
  maxSnapshots?: number;           // default 365
  maxTrades?: number;              // default 1000
}

export async function computePerformance(input: PerformanceInput): Promise<PerformanceMetrics> {
  const [snapshots, trades] = await Promise.all([
    listSnapshots(input.workspaceId, input.portfolioId, { limit: input.maxSnapshots ?? 365 }),
    listTrades(input.workspaceId, input.portfolioId, { limit: input.maxTrades ?? 1000 }),
  ]);
  return derivePerformance({
    snapshots,
    trades,
    startingBalance: input.startingBalance,
    currentEquity: input.currentEquity,
    realisedPnl: input.realisedPnl,
    unrealisedPnl: input.unrealisedPnl,
  });
}

export function derivePerformance(args: {
  snapshots: ArcaPortfolioSnapshot[];
  trades: ArcaTrade[];
  startingBalance: number;
  currentEquity: number;
  realisedPnl: number;
  unrealisedPnl: number;
}): PerformanceMetrics {
  const { snapshots, trades, startingBalance, currentEquity, realisedPnl, unrealisedPnl } = args;
  const ordered = [...snapshots].reverse(); // chronological
  const totalReturnPct = startingBalance > 0 ? ((currentEquity - startingBalance) / startingBalance) * 100 : 0;

  // Drawdown — running peak, current trough
  let peak = startingBalance;
  let maxDdPct = 0;
  for (const s of ordered) {
    if (s.totalEquity > peak) peak = s.totalEquity;
    const dd = peak > 0 ? ((peak - s.totalEquity) / peak) * 100 : 0;
    if (dd > maxDdPct) maxDdPct = dd;
  }
  const currentDdPct = peak > 0 ? ((peak - currentEquity) / peak) * 100 : 0;

  // Daily returns from snapshots → Sharpe/Sortino
  const dailyReturns = computeDailyReturns(ordered, startingBalance);
  const { sharpe, sortino, volAnn } = riskAdjusted(dailyReturns);

  // Trade stats
  const closed = trades.length;
  const wins = trades.filter((t) => t.outcome === "WIN").length;
  const losses = trades.filter((t) => t.outcome === "LOSS").length;
  const breakeven = trades.filter((t) => t.outcome === "BREAKEVEN").length;
  const decisive = wins + losses;
  const winRatePct = decisive > 0 ? (wins / decisive) * 100 : null;

  const rs = trades.map((t) => t.rMultiple).filter((r): r is number => r != null && Number.isFinite(r));
  const avgR = rs.length ? rs.reduce((s, r) => s + r, 0) / rs.length : null;
  const winRs = trades.filter((t) => t.outcome === "WIN").map((t) => t.rMultiple).filter((r): r is number => r != null);
  const lossRs = trades.filter((t) => t.outcome === "LOSS").map((t) => t.rMultiple).filter((r): r is number => r != null);
  const avgWinR = winRs.length ? winRs.reduce((s, r) => s + r, 0) / winRs.length : null;
  const avgLossR = lossRs.length ? lossRs.reduce((s, r) => s + r, 0) / lossRs.length : null;
  const expectancyR =
    winRatePct != null && avgWinR != null && avgLossR != null
      ? (winRatePct / 100) * avgWinR + ((100 - winRatePct) / 100) * avgLossR
      : null;

  const grossWin = trades.filter((t) => t.realisedPnl > 0).reduce((s, t) => s + t.realisedPnl, 0);
  const grossLoss = Math.abs(trades.filter((t) => t.realisedPnl < 0).reduce((s, t) => s + t.realisedPnl, 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : null;

  const largestWin = trades.reduce((m, t) => Math.max(m, t.realisedPnl), 0);
  const largestLoss = trades.reduce((m, t) => Math.min(m, t.realisedPnl), 0);

  // Streaks — most recent first (trades come back exit_time DESC)
  const { currentWin, currentLoss, longestWin, longestLoss } = computeStreaks(trades);

  return {
    startingBalance,
    currentEquity,
    totalReturnPct: round2(totalReturnPct),
    realisedPnl,
    unrealisedPnl,
    maxDrawdownPct: round3(maxDdPct),
    currentDrawdownPct: round3(currentDdPct),
    sharpe: sharpe == null ? null : round3(sharpe),
    sortino: sortino == null ? null : round3(sortino),
    volAnnualisedPct: volAnn == null ? null : round3(volAnn),
    closedTrades: closed,
    wins,
    losses,
    breakeven,
    winRatePct: winRatePct == null ? null : round2(winRatePct),
    avgWinR: avgWinR == null ? null : round3(avgWinR),
    avgLossR: avgLossR == null ? null : round3(avgLossR),
    avgR: avgR == null ? null : round3(avgR),
    expectancyR: expectancyR == null ? null : round3(expectancyR),
    profitFactor: profitFactor == null || !Number.isFinite(profitFactor) ? (profitFactor === Infinity ? null : profitFactor) : round3(profitFactor),
    largestWin: round2(largestWin),
    largestLoss: round2(largestLoss),
    currentWinStreak: currentWin,
    currentLossStreak: currentLoss,
    longestWinStreak: longestWin,
    longestLossStreak: longestLoss,
    computedAt: new Date().toISOString(),
    basedOnSnapshots: ordered.length,
    basedOnTrades: closed,
  };
}

function computeDailyReturns(orderedSnapshots: ArcaPortfolioSnapshot[], startingBalance: number): number[] {
  if (orderedSnapshots.length === 0) return [];
  // Bucket by yyyy-mm-dd, take last snapshot per day.
  const byDay = new Map<string, number>();
  for (const s of orderedSnapshots) {
    const day = (s.snapshotAt || "").slice(0, 10);
    if (!day) continue;
    byDay.set(day, s.totalEquity); // later snapshots overwrite earlier
  }
  const days = Array.from(byDay.keys()).sort();
  if (days.length < 2) return [];
  const returns: number[] = [];
  let prev = startingBalance;
  for (const d of days) {
    const eq = byDay.get(d)!;
    if (prev > 0) returns.push((eq - prev) / prev);
    prev = eq;
  }
  return returns;
}

function riskAdjusted(daily: number[]): { sharpe: number | null; sortino: number | null; volAnn: number | null } {
  if (daily.length < 2) return { sharpe: null, sortino: null, volAnn: null };
  const mean = daily.reduce((s, x) => s + x, 0) / daily.length;
  const variance = daily.reduce((s, x) => s + (x - mean) ** 2, 0) / (daily.length - 1);
  const sd = Math.sqrt(variance);
  const negs = daily.filter((x) => x < 0);
  const downsideVar = negs.length > 0 ? negs.reduce((s, x) => s + x * x, 0) / negs.length : 0;
  const downsideSd = Math.sqrt(downsideVar);
  const ANN = Math.sqrt(252);
  const sharpe = sd > 0 ? (mean / sd) * ANN : null;
  const sortino = downsideSd > 0 ? (mean / downsideSd) * ANN : null;
  const volAnn = sd * ANN * 100;
  return { sharpe, sortino, volAnn };
}

function computeStreaks(trades: ArcaTrade[]): { currentWin: number; currentLoss: number; longestWin: number; longestLoss: number } {
  // listTrades returns exit_time DESC. Build a chronological array.
  const chrono = [...trades].reverse();
  let lw = 0, ll = 0, cw = 0, cl = 0;
  let runW = 0, runL = 0;
  for (const t of chrono) {
    if (t.outcome === "WIN") { runW++; runL = 0; if (runW > lw) lw = runW; }
    else if (t.outcome === "LOSS") { runL++; runW = 0; if (runL > ll) ll = runL; }
    else { runW = 0; runL = 0; }
  }
  // Tail streak (most recent run)
  for (let i = chrono.length - 1; i >= 0; i--) {
    if (chrono[i].outcome === "WIN") { cw++; if (cl > 0) break; }
    else { break; }
  }
  for (let i = chrono.length - 1; i >= 0; i--) {
    if (chrono[i].outcome === "LOSS") { cl++; if (cw > 0) break; }
    else { break; }
  }
  return { currentWin: cw, currentLoss: cl, longestWin: lw, longestLoss: ll };
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
function round3(n: number): number { return Math.round(n * 1000) / 1000; }
