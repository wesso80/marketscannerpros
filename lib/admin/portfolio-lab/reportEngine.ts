/**
 * lib/admin/portfolio-lab/reportEngine.ts
 *
 * Generates DAILY_OPERATOR / EVENING_RECONCILIATION / WEEKLY_REVIEW
 * reports from already-derived data (performanceEngine + playbookEngine
 * + raw store reads). Persists into arca_daily_reports (UNIQUE on
 * workspace+portfolio+date+type, so re-runs upsert).
 *
 * Reports are deterministic and source-attributed — no AI synthesis here.
 * The AI memo layer can consume `report_json` later for narrative.
 */

import { q } from "@/lib/db";
import {
  getDefaultPortfolio,
  listOpenPositions,
  listRiskEvents,
  listTrades,
} from "./portfolioStore";
import { computePerformance, type PerformanceMetrics } from "./performanceEngine";
import { listPlaybookPerformance } from "./playbookEngine";
import { ARCA_DEFAULT_PORTFOLIO_NAME } from "./constants";
import type { ArcaPortfolio, ArcaTrade } from "./types";

export type ReportType = "DAILY_OPERATOR" | "EVENING_RECONCILIATION" | "WEEKLY_REVIEW";

export interface GeneratedReport {
  id: string;
  reportType: ReportType;
  reportDate: string;
  summary: string;
  performance: PerformanceMetrics;
  bestTrade: TradeBrief | null;
  worstTrade: TradeBrief | null;
  topOpportunities: OpportunityBrief[];
  riskSummary: RiskSummary;
  lessons: string | null;
}

interface TradeBrief {
  symbol: string;
  side: string;
  realisedPnl: number;
  rMultiple: number | null;
  outcome: string;
  exitReason: string;
  exitTime: string;
}
interface OpportunityBrief {
  playbookId: string;
  winRate: number | null;
  expectancy: number | null;
  totalPnl: number;
  reason: string;
}
interface RiskSummary {
  openPositions: number;
  openRiskPct: number | null;
  unacknowledgedEvents: number;
  killSwitchActive: boolean;
  notes: string[];
}

export async function generateReport(input: {
  workspaceId: string;
  reportType: ReportType;
  reportDate?: string;          // ISO date, default today (UTC)
}): Promise<GeneratedReport> {
  const portfolio = await getDefaultPortfolio(input.workspaceId, ARCA_DEFAULT_PORTFOLIO_NAME);
  if (!portfolio) throw new Error("ARCA portfolio not initialised");
  const reportDate = (input.reportDate ?? new Date().toISOString().slice(0, 10));

  const [perf, opens, risk, playbooks, allTrades] = await Promise.all([
    computePerformance({
      workspaceId: input.workspaceId,
      portfolioId: portfolio.id,
      startingBalance: portfolio.startingBalance,
      currentEquity: portfolio.totalEquity,
      realisedPnl: portfolio.realisedPnl,
      unrealisedPnl: portfolio.unrealisedPnl,
    }),
    listOpenPositions(input.workspaceId, portfolio.id),
    listRiskEvents(input.workspaceId, portfolio.id, { onlyUnacknowledged: false, limit: 100 }),
    listPlaybookPerformance(input.workspaceId, portfolio.id),
    listTrades(input.workspaceId, portfolio.id, { limit: 200 }),
  ]);

  // Period window for "best trade" / "worst trade":
  //   DAILY_OPERATOR + EVENING_RECONCILIATION → just today
  //   WEEKLY_REVIEW → last 7 calendar days
  const since = windowStart(input.reportType, reportDate);
  const inWindow = allTrades.filter((t) => t.exitTime >= since);

  const bestTrade = pickBest(inWindow);
  const worstTrade = pickWorst(inWindow);

  const topOpps = playbooks
    .filter((p) => p.tradesTaken >= 3 && p.expectancy != null && p.expectancy > 0)
    .slice(0, 5)
    .map<OpportunityBrief>((p) => ({
      playbookId: p.playbookId,
      winRate: p.winRate,
      expectancy: p.expectancy,
      totalPnl: p.totalPnl,
      reason: `${p.tradesTaken} trades, ${p.winRate?.toFixed(1) ?? "?"}% wr, exp ${p.expectancy?.toFixed(2)}R`,
    }));

  const unack = risk.filter((r) => !r.acknowledged).length;
  const kill = risk.some((r) => r.severity === "kill_switch" && !r.acknowledged);
  const openRiskPct = portfolio.totalEquity > 0
    ? round3((opens.reduce((s, p) => s + p.openRisk, 0) / portfolio.totalEquity) * 100)
    : null;

  const summary = buildSummary({
    reportType: input.reportType,
    reportDate,
    portfolio,
    perf,
    bestTrade,
    worstTrade,
    inWindowCount: inWindow.length,
    openRiskPct,
    unack,
    kill,
  });

  const lessons = buildLessons(perf, inWindow);

  const reportJson = {
    portfolio: { id: portfolio.id, name: portfolio.name, equity: portfolio.totalEquity, cash: portfolio.currentCash },
    performance: perf,
    bestTrade,
    worstTrade,
    topOpportunities: topOpps,
    riskSummary: {
      openPositions: opens.length,
      openRiskPct,
      unacknowledgedEvents: unack,
      killSwitchActive: kill,
      notes: [] as string[],
    } satisfies RiskSummary,
    lessons,
    generatedAt: new Date().toISOString(),
  };

  // Upsert
  const rows = await q<{ id: string }>(
    `INSERT INTO arca_daily_reports
       (workspace_id, portfolio_id, report_date, report_type, summary,
        best_trade, worst_trade, top_opportunities, risk_summary,
        performance_summary, lessons, report_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (workspace_id, portfolio_id, report_date, report_type)
     DO UPDATE SET
       summary              = EXCLUDED.summary,
       best_trade           = EXCLUDED.best_trade,
       worst_trade          = EXCLUDED.worst_trade,
       top_opportunities    = EXCLUDED.top_opportunities,
       risk_summary         = EXCLUDED.risk_summary,
       performance_summary  = EXCLUDED.performance_summary,
       lessons              = EXCLUDED.lessons,
       report_json          = EXCLUDED.report_json
     RETURNING id`,
    [
      input.workspaceId, portfolio.id, reportDate, input.reportType, summary,
      JSON.stringify(bestTrade), JSON.stringify(worstTrade),
      JSON.stringify(topOpps), JSON.stringify(reportJson.riskSummary),
      JSON.stringify(perf), lessons, JSON.stringify(reportJson),
    ],
  );

  return {
    id: rows[0].id,
    reportType: input.reportType,
    reportDate,
    summary,
    performance: perf,
    bestTrade,
    worstTrade,
    topOpportunities: topOpps,
    riskSummary: reportJson.riskSummary,
    lessons,
  };
}

export async function listReports(
  workspaceId: string,
  portfolioId: string,
  opts: { reportType?: ReportType; limit?: number } = {},
): Promise<Array<{
  id: string; reportDate: string; reportType: string; summary: string | null;
  createdAt: string; reportJson: unknown;
}>> {
  const limit = Math.min(opts.limit ?? 30, 200);
  const rows = await q<{
    id: string; report_date: string; report_type: string; summary: string | null;
    created_at: string; report_json: unknown;
  }>(
    `SELECT id, report_date, report_type, summary, created_at, report_json
       FROM arca_daily_reports
      WHERE workspace_id=$1 AND portfolio_id=$2
        ${opts.reportType ? "AND report_type=$3" : ""}
      ORDER BY report_date DESC, created_at DESC LIMIT ${limit}`,
    opts.reportType ? [workspaceId, portfolioId, opts.reportType] : [workspaceId, portfolioId],
  );
  return rows.map((r) => ({
    id: r.id,
    reportDate: typeof r.report_date === "string" ? r.report_date : new Date(r.report_date).toISOString().slice(0, 10),
    reportType: r.report_type,
    summary: r.summary,
    createdAt: r.created_at,
    reportJson: r.report_json,
  }));
}

// ---- helpers ----

function windowStart(type: ReportType, reportDate: string): string {
  if (type === "WEEKLY_REVIEW") {
    const d = new Date(reportDate + "T00:00:00.000Z");
    d.setUTCDate(d.getUTCDate() - 7);
    return d.toISOString();
  }
  return reportDate + "T00:00:00.000Z";
}

function pickBest(trades: ArcaTrade[]): TradeBrief | null {
  if (trades.length === 0) return null;
  const best = trades.reduce((m, t) => (t.realisedPnl > m.realisedPnl ? t : m));
  return briefOf(best);
}
function pickWorst(trades: ArcaTrade[]): TradeBrief | null {
  if (trades.length === 0) return null;
  const worst = trades.reduce((m, t) => (t.realisedPnl < m.realisedPnl ? t : m));
  return briefOf(worst);
}
function briefOf(t: ArcaTrade): TradeBrief {
  return {
    symbol: t.symbol,
    side: t.side,
    realisedPnl: t.realisedPnl,
    rMultiple: t.rMultiple,
    outcome: t.outcome,
    exitReason: t.exitReason,
    exitTime: t.exitTime,
  };
}

function buildSummary(args: {
  reportType: ReportType;
  reportDate: string;
  portfolio: ArcaPortfolio;
  perf: PerformanceMetrics;
  bestTrade: TradeBrief | null;
  worstTrade: TradeBrief | null;
  inWindowCount: number;
  openRiskPct: number | null;
  unack: number;
  kill: boolean;
}): string {
  const lines: string[] = [];
  lines.push(`ARCA ${args.reportType.replace(/_/g, " ")} — ${args.reportDate} (SIMULATED)`);
  lines.push(`Equity ${fmtUsd(args.portfolio.totalEquity)} (${signPct(args.perf.totalReturnPct)} since inception)`);
  lines.push(`Cash ${fmtUsd(args.portfolio.currentCash)} · Realised ${fmtUsd(args.portfolio.realisedPnl)} · Unrealised ${fmtUsd(args.portfolio.unrealisedPnl)}`);
  lines.push(`Drawdown — current ${args.perf.currentDrawdownPct.toFixed(2)}%, max ${args.perf.maxDrawdownPct.toFixed(2)}%`);
  if (args.perf.sharpe != null) lines.push(`Sharpe ${args.perf.sharpe.toFixed(2)} · Sortino ${args.perf.sortino?.toFixed(2) ?? "n/a"}`);
  lines.push(`Trades closed in window: ${args.inWindowCount} (lifetime ${args.perf.closedTrades} · winRate ${args.perf.winRatePct?.toFixed(1) ?? "n/a"}%)`);
  if (args.bestTrade) lines.push(`Best: ${args.bestTrade.symbol} ${fmtUsd(args.bestTrade.realisedPnl)} ${args.bestTrade.rMultiple?.toFixed(2) ?? "?"}R (${args.bestTrade.exitReason})`);
  if (args.worstTrade) lines.push(`Worst: ${args.worstTrade.symbol} ${fmtUsd(args.worstTrade.realisedPnl)} ${args.worstTrade.rMultiple?.toFixed(2) ?? "?"}R (${args.worstTrade.exitReason})`);
  if (args.openRiskPct != null) lines.push(`Open risk: ${args.openRiskPct.toFixed(2)}%`);
  if (args.unack > 0) lines.push(`Unacknowledged risk events: ${args.unack}${args.kill ? " — KILL SWITCH" : ""}`);
  lines.push(`Disclaimer: ARCA is SIMULATED only. No broker integration exists.`);
  return lines.join("\n");
}

function buildLessons(perf: PerformanceMetrics, windowTrades: ArcaTrade[]): string | null {
  const out: string[] = [];
  if (perf.currentLossStreak >= 3) out.push(`Loss streak ${perf.currentLossStreak} — consider pausing fresh entries until evidence quality improves.`);
  if (perf.maxDrawdownPct > 10) out.push(`Max drawdown ${perf.maxDrawdownPct.toFixed(1)}% breached 10% — review sizing.`);
  if (perf.winRatePct != null && perf.winRatePct < 35 && perf.closedTrades >= 10) {
    out.push(`Win rate ${perf.winRatePct.toFixed(1)}% below 35% — expectancy must compensate via avg R.`);
  }
  if (perf.expectancyR != null && perf.expectancyR < 0 && perf.closedTrades >= 10) {
    out.push(`Negative expectancy ${perf.expectancyR.toFixed(2)}R — playbook needs review.`);
  }
  // window-specific
  const stoppedInWindow = windowTrades.filter((t) => t.exitReason === "STOP_LOSS").length;
  if (stoppedInWindow >= 3) out.push(`${stoppedInWindow} stop-outs in window — check if entry timing or stop placement is too tight.`);
  return out.length === 0 ? null : out.join(" ");
}

function round3(n: number): number { return Math.round(n * 1000) / 1000; }
function fmtUsd(n: number): string { return "$" + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }); }
function signPct(n: number): string { return (n >= 0 ? "+" : "") + n.toFixed(2) + "%"; }
