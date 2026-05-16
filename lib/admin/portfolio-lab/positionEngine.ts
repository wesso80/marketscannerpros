/**
 * lib/admin/portfolio-lab/positionEngine.ts
 *
 * Marks open positions against the latest market price, simulates
 * stop-loss / take-profit hits, and persists closed trades.
 *
 * NEVER routes a real exit. All decisions are calculated from
 * AdminMarketPacket prices.
 */

import {
  closePositionRow,
  insertTrade,
  markPosition,
  updatePortfolioBalances,
} from "./portfolioStore";
import { writeJournal } from "./journalEngine";
import type {
  ArcaPortfolio,
  ArcaPosition,
  ArcaTrade,
  PositionStatus,
  TradeExitReason,
} from "./types";

export interface MarkInput {
  portfolio: ArcaPortfolio;
  position: ArcaPosition;
  currentPrice: number;
}

export interface MarkResult {
  positionId: string;
  unrealisedPnl: number;
  rMultiple: number | null;
  exit: null | {
    reason: TradeExitReason;
    status: PositionStatus;
    exitPrice: number;
    realisedPnl: number;
    trade: ArcaTrade;
  };
}

/**
 * Mark an open position and, if SL/TP is touched, close it (full exit, single TP for v1).
 */
export async function markAndMaybeExit(input: MarkInput): Promise<MarkResult> {
  const { portfolio, position, currentPrice } = input;
  const side = position.side;
  const direction = side === "LONG" ? 1 : -1;
  const unrealisedPnl = round2(direction * (currentPrice - position.averageEntry) * position.quantity);

  const initialRisk =
    position.stopLoss == null
      ? null
      : Math.abs(position.averageEntry - position.stopLoss) * position.quantity;
  const rMultiple = initialRisk && initialRisk > 0 ? round3(unrealisedPnl / initialRisk) : null;

  // SL / TP triggers
  let exitReason: TradeExitReason | null = null;
  let exitStatus: PositionStatus | null = null;
  let exitPrice = currentPrice;

  if (position.stopLoss != null) {
    if (side === "LONG" && currentPrice <= position.stopLoss) {
      exitReason = "STOP_LOSS";
      exitStatus = "STOPPED";
      exitPrice = position.stopLoss;
    } else if (side === "SHORT" && currentPrice >= position.stopLoss) {
      exitReason = "STOP_LOSS";
      exitStatus = "STOPPED";
      exitPrice = position.stopLoss;
    }
  }
  // TP3 > TP2 > TP1; close on first touch of any defined TP.
  const tps: Array<number | null> = [position.takeProfit3, position.takeProfit2, position.takeProfit1];
  for (const tp of tps) {
    if (tp == null) continue;
    if (side === "LONG" && currentPrice >= tp) {
      if (exitReason !== "STOP_LOSS") {
        exitReason = "TAKE_PROFIT";
        exitStatus = "TARGET_HIT";
        exitPrice = tp;
      }
      break;
    }
    if (side === "SHORT" && currentPrice <= tp) {
      if (exitReason !== "STOP_LOSS") {
        exitReason = "TAKE_PROFIT";
        exitStatus = "TARGET_HIT";
        exitPrice = tp;
      }
      break;
    }
  }

  if (!exitReason || !exitStatus) {
    await markPosition({
      positionId: position.id,
      currentPrice,
      unrealisedPnl,
      currentRMultiple: rMultiple,
    });
    return { positionId: position.id, unrealisedPnl, rMultiple, exit: null };
  }

  // Close.
  const slipPct = portfolio.settings.slippagePctEstimate / 100;
  const feePct = portfolio.settings.feesPctEstimate / 100;
  const effExit =
    side === "LONG" ? exitPrice * (1 - slipPct) : exitPrice * (1 + slipPct);
  const realisedPnl = round2(direction * (effExit - position.averageEntry) * position.quantity);
  const notional = round2(position.quantity * effExit);
  const fees = round2(notional * feePct);
  const realisedNet = round2(realisedPnl - fees);
  const finalR = initialRisk && initialRisk > 0 ? round3(realisedNet / initialRisk) : null;
  const outcome =
    realisedNet > 0 ? "WIN" : realisedNet < 0 ? "LOSS" : "BREAKEVEN";

  await closePositionRow({
    positionId: position.id,
    status: exitStatus,
    realisedPnl: realisedNet,
  });

  const trade = await insertTrade({
    workspaceId: portfolio.workspaceId,
    portfolioId: portfolio.id,
    positionId: position.id,
    symbol: position.symbol,
    assetClass: position.assetClass,
    instrumentType: position.instrumentType,
    side,
    entryPrice: position.averageEntry,
    exitPrice: effExit,
    quantity: position.quantity,
    notionalValue: notional,
    stopLoss: position.stopLoss,
    takeProfit1: position.takeProfit1,
    takeProfit2: position.takeProfit2,
    takeProfit3: position.takeProfit3,
    entryTime: position.openedAt,
    exitTime: new Date().toISOString(),
    realisedPnl: realisedNet,
    rMultiple: finalR,
    feesEstimate: fees,
    slippageEstimate: round2(Math.abs(effExit - exitPrice) * position.quantity),
    outcome,
    exitReason,
    playbookId: position.playbookId,
    sourceEdgePacketId: position.sourceEdgePacketId,
    arcaConfidence: null,
    arcaReasonSummary: `Sim exit via ${exitReason} at ${effExit.toFixed(4)}.`,
  });

  // Reflect cash: long close returns notional; short close pays notional (already received at fill).
  const cashDelta = side === "LONG" ? notional : -notional;
  const newCash = round2(portfolio.currentCash + cashDelta);
  const newRealised = round2(portfolio.realisedPnl + realisedNet);
  const newUnrealised = round2(portfolio.unrealisedPnl - position.unrealisedPnl);
  // Recompute equity: cash + unrealised on remaining opens; caller will recompute holistically.
  const newEquity = round2(newCash + newUnrealised);
  await updatePortfolioBalances({
    portfolioId: portfolio.id,
    currentCash: newCash,
    realisedPnl: newRealised,
    unrealisedPnl: newUnrealised,
    totalEquity: newEquity,
  });

  await writeJournal({
    workspaceId: portfolio.workspaceId,
    portfolioId: portfolio.id,
    journalType: "EXIT",
    title: `EXIT ${exitReason} ${side} ${position.quantity} ${position.symbol} @ ${effExit.toFixed(4)} (R=${finalR ?? "n/a"})`,
    symbol: position.symbol,
    positionId: position.id,
    tradeId: trade.id,
    reasoning: `Sim exit at touch of ${exitReason}. PnL=${realisedNet}. Outcome=${outcome}.`,
    evidence: [
      `entry=${position.averageEntry}`,
      `exit=${effExit.toFixed(4)}`,
      `qty=${position.quantity}`,
      `r=${finalR ?? "n/a"}`,
      `fees=${fees}`,
    ],
    sourcePacketIds: position.sourceEdgePacketId ? [position.sourceEdgePacketId] : [],
  });

  return {
    positionId: position.id,
    unrealisedPnl,
    rMultiple,
    exit: { reason: exitReason, status: exitStatus, exitPrice: effExit, realisedPnl: realisedNet, trade },
  };
}

export async function manualSimClose(args: {
  portfolio: ArcaPortfolio;
  position: ArcaPosition;
  exitPrice: number;
  reason: string;
}): Promise<ArcaTrade> {
  const { portfolio, position, exitPrice } = args;
  const direction = position.side === "LONG" ? 1 : -1;
  const slipPct = portfolio.settings.slippagePctEstimate / 100;
  const feePct = portfolio.settings.feesPctEstimate / 100;
  const effExit =
    position.side === "LONG" ? exitPrice * (1 - slipPct) : exitPrice * (1 + slipPct);
  const realisedPnl = round2(direction * (effExit - position.averageEntry) * position.quantity);
  const notional = round2(position.quantity * effExit);
  const fees = round2(notional * feePct);
  const realisedNet = round2(realisedPnl - fees);
  const initialRisk =
    position.stopLoss == null
      ? null
      : Math.abs(position.averageEntry - position.stopLoss) * position.quantity;
  const finalR = initialRisk && initialRisk > 0 ? round3(realisedNet / initialRisk) : null;
  const outcome = realisedNet > 0 ? "WIN" : realisedNet < 0 ? "LOSS" : "BREAKEVEN";

  await closePositionRow({
    positionId: position.id,
    status: "CLOSED",
    realisedPnl: realisedNet,
  });
  const trade = await insertTrade({
    workspaceId: portfolio.workspaceId,
    portfolioId: portfolio.id,
    positionId: position.id,
    symbol: position.symbol,
    assetClass: position.assetClass,
    instrumentType: position.instrumentType,
    side: position.side,
    entryPrice: position.averageEntry,
    exitPrice: effExit,
    quantity: position.quantity,
    notionalValue: notional,
    stopLoss: position.stopLoss,
    takeProfit1: position.takeProfit1,
    takeProfit2: position.takeProfit2,
    takeProfit3: position.takeProfit3,
    entryTime: position.openedAt,
    exitTime: new Date().toISOString(),
    realisedPnl: realisedNet,
    rMultiple: finalR,
    feesEstimate: fees,
    slippageEstimate: round2(Math.abs(effExit - exitPrice) * position.quantity),
    outcome,
    exitReason: "MANUAL_SIM_CLOSE",
    playbookId: position.playbookId,
    sourceEdgePacketId: position.sourceEdgePacketId,
    arcaConfidence: null,
    arcaReasonSummary: `Manual sim close: ${args.reason}`,
  });

  const cashDelta = position.side === "LONG" ? notional : -notional;
  const newCash = round2(portfolio.currentCash + cashDelta);
  const newRealised = round2(portfolio.realisedPnl + realisedNet);
  await updatePortfolioBalances({
    portfolioId: portfolio.id,
    currentCash: newCash,
    realisedPnl: newRealised,
    unrealisedPnl: portfolio.unrealisedPnl,
    totalEquity: round2(newCash + portfolio.unrealisedPnl),
  });
  await writeJournal({
    workspaceId: portfolio.workspaceId,
    portfolioId: portfolio.id,
    journalType: "EXIT",
    title: `MANUAL EXIT ${position.side} ${position.symbol} @ ${effExit.toFixed(4)}`,
    symbol: position.symbol,
    positionId: position.id,
    tradeId: trade.id,
    reasoning: args.reason,
  });
  return trade;
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
function round3(n: number): number { return Math.round(n * 1000) / 1000; }
