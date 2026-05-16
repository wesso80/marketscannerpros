/**
 * lib/admin/portfolio-lab/playbookEngine.ts
 *
 * Rolls arca_trades up into arca_playbook_performance — one row per
 * playbook_id with rolling counters (trades, wins, losses, win rate,
 * avg R, total pnl, max drawdown, expectancy, best/worst asset class).
 *
 * Idempotent: full recompute every cycle (cheap for the trade volumes
 * ARCA will realistically generate).
 */

import { q } from "@/lib/db";
import type { ArcaPortfolio, ArcaTrade } from "./types";

export interface PlaybookRollupResult {
  playbooksUpdated: number;
  totalTradesScanned: number;
  computedAt: string;
}

export async function rollupPlaybookPerformance(portfolio: ArcaPortfolio): Promise<PlaybookRollupResult> {
  const trades = await q<{
    playbook_id: string | null;
    asset_class: string;
    realised_pnl: string;
    r_multiple: string | null;
    outcome: string;
  }>(
    `SELECT playbook_id, asset_class, realised_pnl, r_multiple, outcome
       FROM arca_trades
      WHERE workspace_id=$1 AND portfolio_id=$2`,
    [portfolio.workspaceId, portfolio.id],
  );

  // Group by playbook_id (treat null as "_unspecified").
  const byPb = new Map<string, ArcaTradeForRollup[]>();
  for (const t of trades) {
    const pb = (t.playbook_id || "_unspecified").trim() || "_unspecified";
    const arr = byPb.get(pb) ?? [];
    arr.push({
      playbookId: pb,
      assetClass: t.asset_class,
      realisedPnl: Number(t.realised_pnl),
      rMultiple: t.r_multiple == null ? null : Number(t.r_multiple),
      outcome: t.outcome,
    });
    byPb.set(pb, arr);
  }

  let playbooksUpdated = 0;
  for (const [pb, list] of byPb) {
    const wins = list.filter((t) => t.outcome === "WIN").length;
    const losses = list.filter((t) => t.outcome === "LOSS").length;
    const decisive = wins + losses;
    const winRate = decisive > 0 ? (wins / decisive) * 100 : null;
    const rs = list.map((t) => t.rMultiple).filter((r): r is number => r != null);
    const avgR = rs.length ? rs.reduce((s, r) => s + r, 0) / rs.length : null;
    const totalPnl = list.reduce((s, t) => s + t.realisedPnl, 0);

    // Expectancy in R terms.
    const winRs = list.filter((t) => t.outcome === "WIN").map((t) => t.rMultiple).filter((r): r is number => r != null);
    const lossRs = list.filter((t) => t.outcome === "LOSS").map((t) => t.rMultiple).filter((r): r is number => r != null);
    const avgWinR = winRs.length ? winRs.reduce((s, r) => s + r, 0) / winRs.length : null;
    const avgLossR = lossRs.length ? lossRs.reduce((s, r) => s + r, 0) / lossRs.length : null;
    const expectancy =
      winRate != null && avgWinR != null && avgLossR != null
        ? (winRate / 100) * avgWinR + ((100 - winRate) / 100) * avgLossR
        : null;

    // Per-class equity-curve drawdown isn't tracked at trade level — proxy
    // with worst cumulative-pnl run on chronological order (best-effort).
    const maxDd = computeMaxDrawdownFromTrades(list);

    // Best/worst asset class by total P&L within this playbook.
    const byClass = new Map<string, number>();
    for (const t of list) byClass.set(t.assetClass, (byClass.get(t.assetClass) ?? 0) + t.realisedPnl);
    const sorted = Array.from(byClass.entries()).sort((a, b) => b[1] - a[1]);
    const bestClass = sorted[0]?.[0] ?? null;
    const worstClass = sorted.length > 1 ? sorted[sorted.length - 1][0] : null;

    await q(
      `INSERT INTO arca_playbook_performance
         (workspace_id, portfolio_id, playbook_id, setup_count, trades_taken,
          wins, losses, win_rate, average_r, total_pnl, max_drawdown,
          expectancy, best_asset_class, worst_asset_class, last_updated)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, NOW())
       ON CONFLICT (workspace_id, portfolio_id, playbook_id)
       DO UPDATE SET
         setup_count       = EXCLUDED.setup_count,
         trades_taken      = EXCLUDED.trades_taken,
         wins              = EXCLUDED.wins,
         losses            = EXCLUDED.losses,
         win_rate          = EXCLUDED.win_rate,
         average_r         = EXCLUDED.average_r,
         total_pnl         = EXCLUDED.total_pnl,
         max_drawdown      = EXCLUDED.max_drawdown,
         expectancy        = EXCLUDED.expectancy,
         best_asset_class  = EXCLUDED.best_asset_class,
         worst_asset_class = EXCLUDED.worst_asset_class,
         last_updated      = NOW()`,
      [
        portfolio.workspaceId,
        portfolio.id,
        pb,
        list.length,                      // setup_count (≈ trades for now)
        list.length,                      // trades_taken
        wins,
        losses,
        winRate == null ? null : round3(winRate),
        avgR == null ? null : round3(avgR),
        round2(totalPnl),
        maxDd == null ? null : round3(maxDd),
        expectancy == null ? null : round3(expectancy),
        bestClass,
        worstClass,
      ],
    );
    playbooksUpdated++;
  }

  return { playbooksUpdated, totalTradesScanned: trades.length, computedAt: new Date().toISOString() };
}

export async function listPlaybookPerformance(
  workspaceId: string,
  portfolioId: string,
): Promise<Array<{
  playbookId: string;
  setupCount: number; tradesTaken: number;
  wins: number; losses: number;
  winRate: number | null; averageR: number | null;
  totalPnl: number; maxDrawdown: number | null;
  expectancy: number | null;
  bestAssetClass: string | null; worstAssetClass: string | null;
  lastUpdated: string;
}>> {
  const rows = await q<{
    playbook_id: string;
    setup_count: number; trades_taken: number;
    wins: number; losses: number;
    win_rate: string | null; average_r: string | null;
    total_pnl: string; max_drawdown: string | null;
    expectancy: string | null;
    best_asset_class: string | null; worst_asset_class: string | null;
    last_updated: string;
  }>(
    `SELECT playbook_id, setup_count, trades_taken, wins, losses, win_rate,
            average_r, total_pnl, max_drawdown, expectancy,
            best_asset_class, worst_asset_class, last_updated
       FROM arca_playbook_performance
      WHERE workspace_id=$1 AND portfolio_id=$2
      ORDER BY total_pnl DESC NULLS LAST`,
    [workspaceId, portfolioId],
  );
  return rows.map((r) => ({
    playbookId: r.playbook_id,
    setupCount: Number(r.setup_count),
    tradesTaken: Number(r.trades_taken),
    wins: Number(r.wins),
    losses: Number(r.losses),
    winRate: r.win_rate == null ? null : Number(r.win_rate),
    averageR: r.average_r == null ? null : Number(r.average_r),
    totalPnl: Number(r.total_pnl),
    maxDrawdown: r.max_drawdown == null ? null : Number(r.max_drawdown),
    expectancy: r.expectancy == null ? null : Number(r.expectancy),
    bestAssetClass: r.best_asset_class,
    worstAssetClass: r.worst_asset_class,
    lastUpdated: r.last_updated,
  }));
}

interface ArcaTradeForRollup {
  playbookId: string;
  assetClass: string;
  realisedPnl: number;
  rMultiple: number | null;
  outcome: string;
}

function computeMaxDrawdownFromTrades(trades: ArcaTradeForRollup[]): number | null {
  if (trades.length === 0) return null;
  let cum = 0;
  let peak = 0;
  let maxDdAbs = 0;
  for (const t of trades) {
    cum += t.realisedPnl;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDdAbs) maxDdAbs = dd;
  }
  // Express as % of peak (or absolute if peak is 0).
  if (peak > 0) return (maxDdAbs / peak) * 100;
  return maxDdAbs === 0 ? 0 : null;
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
function round3(n: number): number { return Math.round(n * 1000) / 1000; }
