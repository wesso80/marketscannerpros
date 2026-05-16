/**
 * lib/admin/portfolio-lab/simulatedOrderEngine.ts
 *
 * Creates and triggers SIMULATED orders. Never routes to a broker.
 *
 * Fill logic against latest market price:
 *   - MARKET_SIM        : fill immediately at `currentPrice`.
 *   - LIMIT_SIM (LONG)  : fill when currentPrice <= triggerPrice.
 *   - LIMIT_SIM (SHORT) : fill when currentPrice >= triggerPrice.
 *   - STOP_SIM  (LONG)  : fill when currentPrice >= triggerPrice.
 *   - STOP_SIM  (SHORT) : fill when currentPrice <= triggerPrice.
 *
 * Slippage estimate applied to fillPrice.
 */

import { insertSimOrder, updateSimOrderStatus, insertPosition, updatePortfolioBalances } from "./portfolioStore";
import { writeJournal } from "./journalEngine";
import type {
  ArcaAssetClass,
  ArcaPortfolio,
  ArcaSimOrder,
  ArcaPosition,
  SimOrderSide,
  SimOrderType,
  SimOrderStatus,
} from "./types";

export interface CreateSimOrderInput {
  portfolio: ArcaPortfolio;
  symbol: string;
  assetClass: ArcaAssetClass;
  instrumentType?: string;
  side: SimOrderSide;
  orderType: SimOrderType;
  plannedEntry: number | null;
  triggerPrice: number | null;
  quantity: number;
  notional: number;
  stopLoss: number | null;
  takeProfit1: number | null;
  takeProfit2: number | null;
  takeProfit3: number | null;
  sourceEdgePacketId: string | null;
  playbookId: string | null;
  createdReason: string;
  arcaConfidence: number | null;
}

export async function createSimulatedOrder(input: CreateSimOrderInput): Promise<ArcaSimOrder> {
  const status: SimOrderStatus = input.orderType === "MARKET_SIM" ? "TRIGGERED" : "WAITING_FOR_TRIGGER";

  const order = await insertSimOrder({
    workspaceId: input.portfolio.workspaceId,
    portfolioId: input.portfolio.id,
    symbol: input.symbol,
    assetClass: input.assetClass,
    instrumentType: input.instrumentType ?? "spot",
    side: input.side,
    orderType: input.orderType,
    status,
    plannedEntry: input.plannedEntry,
    triggerPrice: input.triggerPrice,
    quantity: input.quantity,
    notionalValue: input.notional,
    stopLoss: input.stopLoss,
    takeProfit1: input.takeProfit1,
    takeProfit2: input.takeProfit2,
    takeProfit3: input.takeProfit3,
    sourceEdgePacketId: input.sourceEdgePacketId,
    playbookId: input.playbookId,
    createdReason: input.createdReason,
    arcaConfidence: input.arcaConfidence,
  });

  await writeJournal({
    workspaceId: input.portfolio.workspaceId,
    portfolioId: input.portfolio.id,
    journalType: "ENTRY",
    title: `Sim ${input.orderType} ${input.side} ${input.quantity} ${input.symbol} @ ${input.triggerPrice ?? input.plannedEntry}`,
    symbol: input.symbol,
    orderId: order.id,
    reasoning: input.createdReason,
    evidence: [
      `entry=${input.triggerPrice ?? input.plannedEntry}`,
      `stop=${input.stopLoss}`,
      `tp1=${input.takeProfit1}`,
      `qty=${input.quantity}`,
      `notional=${input.notional}`,
    ],
    sourcePacketIds: input.sourceEdgePacketId ? [input.sourceEdgePacketId] : [],
  });

  return order;
}

/**
 * Decide whether a planned/waiting order should be filled given the current market price.
 */
export function shouldFill(order: ArcaSimOrder, currentPrice: number): boolean {
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return false;
  if (order.orderType === "MARKET_SIM") return true;
  if (order.triggerPrice == null) return false;
  const side = order.side;
  if (order.orderType === "LIMIT_SIM") {
    if (side === "BUY" || side === "LONG") return currentPrice <= order.triggerPrice;
    return currentPrice >= order.triggerPrice;
  }
  if (order.orderType === "STOP_SIM") {
    if (side === "BUY" || side === "LONG") return currentPrice >= order.triggerPrice;
    return currentPrice <= order.triggerPrice;
  }
  return false;
}

/**
 * Fill a triggered/waiting order — write FILLED_SIM, open a position,
 * deduct cash. All numbers are simulated.
 */
export async function fillOrderAndOpenPosition(args: {
  portfolio: ArcaPortfolio;
  order: ArcaSimOrder;
  currentPrice: number;
}): Promise<ArcaPosition> {
  const { portfolio, order, currentPrice } = args;
  const slipPct = portfolio.settings.slippagePctEstimate / 100;
  const positionSide: "LONG" | "SHORT" =
    order.side === "BUY" || order.side === "LONG" ? "LONG" : "SHORT";
  const fillPrice =
    positionSide === "LONG"
      ? currentPrice * (1 + slipPct)
      : currentPrice * (1 - slipPct);

  await updateSimOrderStatus({ orderId: order.id, status: "FILLED_SIM", filledPrice: fillPrice });

  const openRisk =
    order.stopLoss == null
      ? 0
      : Math.abs(fillPrice - order.stopLoss) * order.quantity;

  const position = await insertPosition({
    workspaceId: portfolio.workspaceId,
    portfolioId: portfolio.id,
    symbol: order.symbol,
    assetClass: order.assetClass,
    instrumentType: order.instrumentType,
    side: positionSide,
    quantity: order.quantity,
    averageEntry: fillPrice,
    stopLoss: order.stopLoss,
    takeProfit1: order.takeProfit1,
    takeProfit2: order.takeProfit2,
    takeProfit3: order.takeProfit3,
    openRisk,
    sourceOrderId: order.id,
    sourceEdgePacketId: order.sourceEdgePacketId,
    playbookId: order.playbookId,
  });

  // Cash deduction: long buys consume cash; short sells receive proceeds.
  const cashDelta = positionSide === "LONG"
    ? -(fillPrice * order.quantity)
    : (fillPrice * order.quantity);
  const newCash = round2(portfolio.currentCash + cashDelta);
  const newEquity = round2(newCash + portfolio.unrealisedPnl + (portfolio.totalEquity - portfolio.currentCash));
  await updatePortfolioBalances({
    portfolioId: portfolio.id,
    currentCash: newCash,
    realisedPnl: portfolio.realisedPnl,
    unrealisedPnl: portfolio.unrealisedPnl,
    totalEquity: newEquity,
  });

  await writeJournal({
    workspaceId: portfolio.workspaceId,
    portfolioId: portfolio.id,
    journalType: "ENTRY",
    title: `FILLED ${positionSide} ${order.quantity} ${order.symbol} @ ${fillPrice.toFixed(4)}`,
    symbol: order.symbol,
    orderId: order.id,
    positionId: position.id,
    reasoning: `Sim fill: trigger=${order.triggerPrice}, current=${currentPrice}, slippage=${(slipPct * 100).toFixed(3)}%`,
    evidence: [
      `fill_price=${fillPrice.toFixed(4)}`,
      `qty=${order.quantity}`,
      `open_risk=${openRisk.toFixed(2)}`,
      `stop=${order.stopLoss}`,
      `tp1=${order.takeProfit1}`,
    ],
    sourcePacketIds: order.sourceEdgePacketId ? [order.sourceEdgePacketId] : [],
  });

  return position;
}

export async function cancelOrder(args: {
  portfolio: ArcaPortfolio;
  order: ArcaSimOrder;
  reason: string;
}): Promise<void> {
  await updateSimOrderStatus({ orderId: args.order.id, status: "CANCELLED" });
  await writeJournal({
    workspaceId: args.portfolio.workspaceId,
    portfolioId: args.portfolio.id,
    journalType: "UPDATE",
    title: `Sim order CANCELLED ${args.order.symbol}`,
    symbol: args.order.symbol,
    orderId: args.order.id,
    reasoning: args.reason,
  });
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
