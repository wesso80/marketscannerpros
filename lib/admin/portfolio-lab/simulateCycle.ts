/**
 * lib/admin/portfolio-lab/simulateCycle.ts
 *
 * Orchestrator for the ARCA Portfolio Lab. One "cycle" =
 *   1. Mark every open position against the latest edge-packet snapshot price.
 *   2. Process SL/TP exits (positionEngine.markAndMaybeExit).
 *   3. Trigger / fill any waiting LIMIT_SIM / STOP_SIM orders whose
 *      trigger price has been reached.
 *   4. Ask the decision engine for new candidates and create planned
 *      orders for the best ones (subject to risk caps).
 *   5. Persist a fresh portfolio_snapshot.
 *
 * Pure paper. No broker. No order routing.
 */

import { runDecisionEngine, type SelectedCandidate } from "./decisionEngine";
import {
  insertSnapshot,
  listOrders,
  listOpenPositions,
  updatePortfolioBalances,
  getDefaultPortfolio,
} from "./portfolioStore";
import { ARCA_DEFAULT_PORTFOLIO_NAME } from "./constants";
import { createDefaultArcaPortfolio } from "./createPortfolio";
import {
  createSimulatedOrder,
  fillOrderAndOpenPosition,
  shouldFill,
} from "./simulatedOrderEngine";
import { markAndMaybeExit } from "./positionEngine";
import { sizeForPortfolio } from "./positionSizing";
import { checkPreTrade, emitRiskEventIfBreached } from "./riskEngine";
import { writeJournal } from "./journalEngine";
import { captureBenchmarkSnapshot } from "./benchmarkEngine";
import { rollupPlaybookPerformance } from "./playbookEngine";
import { loadEdgePackets } from "@/lib/admin/edgePacketSnapshots";
import type { ArcaPortfolio, ArcaPosition, SimulateCycleResult } from "./types";

export interface SimulateCycleOptions {
  workspaceId: string;
  maxNewIdeas?: number;
  sinceMinutes?: number;
}

export async function simulateArcaCycle(opts: SimulateCycleOptions): Promise<SimulateCycleResult> {
  const portfolio = await ensurePortfolio(opts.workspaceId);
  const notes: string[] = [];
  let ordersCreated = 0;
  let ordersTriggered = 0;
  let ordersCancelled = 0;
  let positionsOpened = 0;
  let positionsMarked = 0;
  let positionsClosed = 0;
  let riskEventsCreated = 0;
  let rejections = 0;

  // Build a symbol → latest price map from recent edge-packet snapshots.
  const recent = await loadEdgePackets({
    workspaceId: opts.workspaceId,
    since: new Date(Date.now() - (opts.sinceMinutes ?? 240) * 60_000).toISOString(),
    limit: 300,
  });
  const priceBySymbol = new Map<string, number>();
  for (const r of recent) {
    if (priceBySymbol.has(r.symbol)) continue;
    const p = (r.packetJson as unknown as { snapshot?: { price?: number } }).snapshot?.price;
    if (Number.isFinite(p)) priceBySymbol.set(r.symbol, Number(p));
  }

  // 1+2. Mark & maybe exit open positions.
  const opens = await listOpenPositions(opts.workspaceId, portfolio.id);
  let runningPortfolio = portfolio;
  for (const pos of opens) {
    const px = priceBySymbol.get(pos.symbol);
    if (!Number.isFinite(px)) {
      notes.push(`skip_mark:${pos.symbol}:no_price`);
      continue;
    }
    const res = await markAndMaybeExit({
      portfolio: runningPortfolio,
      position: pos,
      currentPrice: px!,
    });
    positionsMarked++;
    if (res.exit) positionsClosed++;
    // Refresh portfolio after each cash-impacting operation.
    runningPortfolio = (await getDefaultPortfolio(opts.workspaceId, runningPortfolio.name)) ?? runningPortfolio;
  }

  // 3. Trigger waiting orders.
  const waiting = await listOrders(opts.workspaceId, portfolio.id, {
    status: ["WAITING_FOR_TRIGGER", "PLANNED"],
  });
  for (const order of waiting) {
    const px = priceBySymbol.get(order.symbol);
    if (!Number.isFinite(px)) continue;
    if (!shouldFill(order, px!)) continue;
    await fillOrderAndOpenPosition({
      portfolio: runningPortfolio,
      order,
      currentPrice: px!,
    });
    ordersTriggered++;
    positionsOpened++;
    runningPortfolio = (await getDefaultPortfolio(opts.workspaceId, runningPortfolio.name)) ?? runningPortfolio;
  }

  // 4. New candidates → planned/limit orders.
  const decision = await runDecisionEngine({
    portfolio: runningPortfolio,
    maxNewIdeas: opts.maxNewIdeas ?? 5,
    sinceMinutes: opts.sinceMinutes ?? 240,
  });

  for (const cand of decision.selected) {
    const sizing = sizeForPortfolio(runningPortfolio, {
      entry: cand.entry,
      stop: cand.stop,
      side: cand.side,
      assetClass: cand.assetClass,
    });
    if (!sizing.ok) {
      rejections++;
      await writeJournal({
        workspaceId: opts.workspaceId,
        portfolioId: portfolio.id,
        journalType: "REJECTED",
        title: `REJECTED ${cand.row.symbol} — sizing_${sizing.reason ?? "failed"}`,
        symbol: cand.row.symbol,
        reasoning: `Could not size: ${sizing.reason ?? "unknown"}. entry=${cand.entry} stop=${cand.stop}`,
        sourcePacketIds: [cand.row.packetId],
      });
      continue;
    }
    const pre = await checkPreTrade({
      portfolio: runningPortfolio,
      assetClass: cand.assetClass,
      riskDollars: sizing.riskDollars,
      notional: sizing.notional,
    });
    if (!pre.ok) {
      rejections++;
      await writeJournal({
        workspaceId: opts.workspaceId,
        portfolioId: portfolio.id,
        journalType: "RISK_BLOCK",
        title: `RISK BLOCK ${cand.row.symbol} — ${pre.reasons.join("|")}`,
        symbol: cand.row.symbol,
        reasoning: `Pre-trade risk check failed: ${pre.reasons.join(", ")}.`,
        sourcePacketIds: [cand.row.packetId],
      });
      await emitRiskEventIfBreached({
        portfolio: runningPortfolio,
        eventType: "PRE_TRADE_BLOCK",
        severity: "warning",
        message: `Blocked ${cand.row.symbol}: ${pre.reasons.join(", ")}`,
        affectedSymbol: cand.row.symbol,
      });
      riskEventsCreated++;
      continue;
    }

    // Create as LIMIT_SIM with trigger = entry, waiting for price to come.
    await createSimulatedOrder({
      portfolio: runningPortfolio,
      symbol: cand.row.symbol,
      assetClass: cand.assetClass,
      side: cand.side,
      orderType: "LIMIT_SIM",
      plannedEntry: cand.entry,
      triggerPrice: cand.entry,
      quantity: sizing.quantity,
      notional: sizing.notional,
      stopLoss: cand.stop,
      takeProfit1: cand.tp1,
      takeProfit2: cand.tp2,
      takeProfit3: cand.tp3,
      sourceEdgePacketId: cand.row.packetId,
      playbookId: cand.row.setupType || null,
      createdReason: `ARCA selected: rank=${cand.row.opportunityRankScore.toFixed(1)} thesis=${cand.row.thesisStatus} rr1=${cand.rrToTp1 ?? "n/a"}`,
      arcaConfidence: clamp(cand.row.trustAdjustedScore, 0, 100),
    });
    ordersCreated++;
  }

  // Journal rejections in bulk (no DB row per — single REJECTED summary).
  if (decision.rejected.length > 0) {
    await writeJournal({
      workspaceId: opts.workspaceId,
      portfolioId: portfolio.id,
      journalType: "REJECTED",
      title: `Rejected ${decision.rejected.length} candidates in cycle`,
      reasoning: decision.rejected
        .slice(0, 25)
        .map((r) => `${r.symbol}: ${r.reasons.join("|")}`)
        .join("\n"),
    });
  }

  // 5. Snapshot.
  const closingOpens = await listOpenPositions(opts.workspaceId, portfolio.id);
  const exposure = bucketExposure(closingOpens);
  const finalPortfolio = (await getDefaultPortfolio(opts.workspaceId, runningPortfolio.name)) ?? runningPortfolio;
  const unrealised = closingOpens.reduce((s, p) => s + p.unrealisedPnl, 0);
  const equity = round2(finalPortfolio.currentCash + unrealised);
  await updatePortfolioBalances({
    portfolioId: finalPortfolio.id,
    currentCash: finalPortfolio.currentCash,
    realisedPnl: finalPortfolio.realisedPnl,
    unrealisedPnl: round2(unrealised),
    totalEquity: equity,
  });
  const openRiskPct = closingOpens.length === 0 ? 0 : round3((closingOpens.reduce((s, p) => s + p.openRisk, 0) / equity) * 100);
  await insertSnapshot({
    workspaceId: opts.workspaceId,
    portfolioId: finalPortfolio.id,
    cash: finalPortfolio.currentCash,
    totalEquity: equity,
    realisedPnl: finalPortfolio.realisedPnl,
    unrealisedPnl: round2(unrealised),
    dailyPnl: null,
    drawdownPct: round3(Math.min(0, ((equity - finalPortfolio.startingBalance) / finalPortfolio.startingBalance) * 100)),
    exposureEquities: round2(exposure.equity ?? 0),
    exposureCrypto: round2(exposure.crypto ?? 0),
    exposureCommodities: round2(exposure.commodity ?? 0),
    exposureOptions: round2(exposure.options ?? 0),
    exposureFutures: round2(exposure.futures ?? 0),
    openPositionsCount: closingOpens.length,
    openRiskPct,
  });

  // 6. Benchmark + playbook rollup (best-effort; never block the cycle).
  let benchmarkCaptured = false;
  let benchmarkSymbol: string | undefined;
  let playbooksUpdated: number | undefined;
  try {
    const refreshed = (await getDefaultPortfolio(opts.workspaceId, runningPortfolio.name)) ?? finalPortfolio;
    const bm = await captureBenchmarkSnapshot({ portfolio: refreshed });
    benchmarkCaptured = bm.ok;
    benchmarkSymbol = bm.benchmarkSymbol;
    if (!bm.ok) notes.push(`benchmark: ${bm.reason ?? "unavailable"}`);
  } catch (err) {
    notes.push(`benchmark error: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    const refreshed = (await getDefaultPortfolio(opts.workspaceId, runningPortfolio.name)) ?? finalPortfolio;
    const pb = await rollupPlaybookPerformance(refreshed);
    playbooksUpdated = pb.playbooksUpdated;
  } catch (err) {
    notes.push(`playbook rollup error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    portfolioId: finalPortfolio.id,
    cycleAt: new Date().toISOString(),
    ordersCreated,
    ordersTriggered,
    ordersCancelled,
    positionsOpened,
    positionsMarked,
    positionsClosed,
    riskEventsCreated,
    rejections,
    notes,
    benchmarkCaptured,
    benchmarkSymbol,
    playbooksUpdated,
  };
}

async function ensurePortfolio(workspaceId: string): Promise<ArcaPortfolio> {
  const existing = await getDefaultPortfolio(workspaceId, ARCA_DEFAULT_PORTFOLIO_NAME);
  if (existing) return existing;
  const r = await createDefaultArcaPortfolio(workspaceId);
  return r.portfolio;
}

function bucketExposure(positions: ArcaPosition[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of positions) {
    const notional = (p.currentPrice ?? p.averageEntry) * p.quantity;
    out[p.assetClass] = (out[p.assetClass] ?? 0) + notional;
  }
  return out;
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
function round3(n: number): number { return Math.round(n * 1000) / 1000; }
function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
