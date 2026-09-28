import { evaluatePaperExitPath, nearestPaperTarget, type PaperExitPath } from './paperExitPath';
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
} from "./portfolioStore";
import { refreshPaperBalances } from "./refreshPaperBalances";
import { writeJournal } from "./journalEngine";
import { recordTradeClosureLearning } from "@/lib/admin/arca-brain/recordTradeClosureLearning";
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
  candlePath?: PaperExitPath;
}

export interface MarkResult {
  pathStatus?: string;
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

  const initialRisk = originalRisk(position);
  const rMultiple = initialRisk && initialRisk > 0 ? round3(unrealisedPnl / initialRisk) : null;

  // SL / TP triggers
  let exitReason: TradeExitReason | null = null;
  let exitStatus: PositionStatus | null = null;
  let exitPrice = currentPrice;

  if (position.stopLoss != null) {
    if (side === "LONG" && currentPrice <= position.stopLoss) {
      exitReason = "STOP_LOSS";
      exitStatus = "STOPPED";
      exitPrice = currentPrice; // A gap through the stop cannot fill at the better stop price.
    } else if (side === "SHORT" && currentPrice >= position.stopLoss) {
      exitReason = "STOP_LOSS";
      exitStatus = "STOPPED";
      exitPrice = currentPrice; // A gap through the stop cannot fill at the better stop price.
    }
  }
  // Full-exit strategy: the nearest profitable resting target closes the position.
  // A later snapshot beyond several targets cannot award the furthest target.
  const tps = [nearestPaperTarget(position)];
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

  const path = evaluatePaperExitPath(position, input.candlePath);
  const pathStatus = path.status + (path.entryCandleExcluded ? ':entry_candle_excluded' : '')
    + (path.checkedThrough ? `:through=${path.checkedThrough}` : '');
  // A historical touch precedes the latest quote, including a later reversal.
  if (path.exit) {
    exitReason = path.exit.reason;
    exitStatus = exitReason === 'STOP_LOSS' ? 'STOPPED' : 'TARGET_HIT';
    exitPrice = path.exit.price;
  }

  if (!exitReason || !exitStatus) {
    await markPosition({
      positionId: position.id,
      currentPrice,
      unrealisedPnl,
      currentRMultiple: rMultiple,
    });
    if (path.checkpoint) {
      // The cycle transaction commits the mark and checkpoint together; retries cannot skip a failed write.
      await writeJournal({
        workspaceId: portfolio.workspaceId, portfolioId: portfolio.id,
        positionId: position.id, symbol: position.symbol, journalType: 'REVIEW',
        title: 'Paper candle checkpoint v1',
        reasoning: 'Fixed exit levels checked through completed candles. Entry-containing candle excluded when applicable.',
        evidence: [JSON.stringify(path.checkpoint)],
        dataFreshness: path.checkpoint.through,
      });
    }
    return { positionId: position.id, unrealisedPnl, rMultiple, pathStatus, exit: null };
  }

  // Close.
  const slipPct = portfolio.settings.slippagePctEstimate / 100;
  const feePct = portfolio.settings.feesPctEstimate / 100;
  const effExit =
    side === "LONG" ? exitPrice * (1 - slipPct) : exitPrice * (1 + slipPct);
  const realisedPnl = round2(direction * (effExit - position.averageEntry) * position.quantity);
  const notional = round2(position.quantity * effExit);
  const fees = round2(notional * feePct);
  const entryFee = position.entryFee ?? 0;
  const realisedNet = round2(realisedPnl - fees - entryFee);
  const finalR = initialRisk && initialRisk > 0 ? round3(realisedNet / initialRisk) : null;
  const outcome =
    realisedNet > 0 ? "WIN" : realisedNet < 0 ? "LOSS" : "BREAKEVEN";

  await closePositionRow({
    positionId: position.id,
    status: exitStatus,
    realisedPnl: realisedNet,
    closedAt: path.exit?.at,
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
    exitTime: path.exit?.at ?? new Date().toISOString(),
    realisedPnl: realisedNet,
    rMultiple: finalR,
    feesEstimate: round2(fees + entryFee),
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
  const newCash = round2(portfolio.currentCash + cashDelta - fees);
  const newRealised = round2(portfolio.realisedPnl + realisedNet + entryFee);
  await refreshPaperBalances(portfolio, newCash, newRealised);

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
      `exit_fee=${fees}`,
      `entry_fee=${entryFee}`,
      `path=${pathStatus}`,
      `source=${path.exit ? input.candlePath?.source : 'latest_quote'}`,
      `candle_close_upper_bound=${path.exit?.at ?? 'n/a'}`,
      `stop_target_order_ambiguous=${path.exit?.ambiguous ?? false}`,
    ],
    sourcePacketIds: position.sourceEdgePacketId ? [position.sourceEdgePacketId] : [],
  });

  // P1 — Closed-trade learning loop. Soft-failed so a labeller/doctrine
  // failure cannot corrupt the close itself.
  await recordTradeClosureLearning({
    trade,
    portfolio,
    manualClose: false,
  }).catch(() => undefined);

  return {
    positionId: position.id,
    unrealisedPnl,
    rMultiple,
    pathStatus,
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
  const entryFee = position.entryFee ?? 0;
  const realisedNet = round2(realisedPnl - fees - entryFee);
  const initialRisk = originalRisk(position);
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
    feesEstimate: round2(fees + entryFee),
    slippageEstimate: round2(Math.abs(effExit - exitPrice) * position.quantity),
    outcome,
    exitReason: "MANUAL_SIM_CLOSE",
    playbookId: position.playbookId,
    sourceEdgePacketId: position.sourceEdgePacketId,
    arcaConfidence: null,
    arcaReasonSummary: `Manual sim close: ${args.reason}`,
  });

  const cashDelta = position.side === "LONG" ? notional : -notional;
  const newCash = round2(portfolio.currentCash + cashDelta - fees);
  const newRealised = round2(portfolio.realisedPnl + realisedNet + entryFee);
  await refreshPaperBalances(portfolio, newCash, newRealised);
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

  // P1 — Closed-trade learning loop. Manual closes still feed the labeller
  // so EXIT_TOO_EARLY / NO_MISTAKE_SYSTEM_VALID branches reach the engine.
  await recordTradeClosureLearning({
    trade,
    portfolio,
    manualClose: true,
    overrides: { reasoningNote: args.reason },
  }).catch(() => undefined);

  return trade;
}

function originalRisk(position: ArcaPosition): number | null {
  const risk = position.initialRiskDollars;
  return risk != null && Number.isFinite(risk) && risk > 0 ? risk : null;
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
function round3(n: number): number { return Math.round(n * 1000) / 1000; }
