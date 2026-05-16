/**
 * lib/admin/portfolio-lab/portfolioStore.ts
 *
 * Thin DB layer for ARCA Portfolio Lab. Workspace-isolated.
 * No business logic — engines call into this; routes never touch SQL.
 */

import { q } from "@/lib/db";
import { ARCA_DEFAULT_SETTINGS } from "./constants";
import type {
  ArcaPortfolio,
  ArcaPortfolioSettings,
  ArcaPortfolioSnapshot,
  ArcaPortfolioStatus,
  ArcaSimOrder,
  ArcaPosition,
  ArcaTrade,
  ArcaJournalEntry,
  ArcaRiskEvent,
  SimOrderStatus,
  PositionStatus,
} from "./types";

// ───────────────────────────────────────── mappers

function n(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
function nOrNull(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}
function s(v: unknown): string {
  return v == null ? "" : String(v);
}
function sOrNull(v: unknown): string | null {
  return v == null ? null : String(v);
}
function arr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "string") {
    try {
      const j = JSON.parse(v);
      return Array.isArray(j) ? j.map((x) => String(x)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapPortfolio(r: any): ArcaPortfolio {
  const settings: ArcaPortfolioSettings = {
    ...ARCA_DEFAULT_SETTINGS,
    ...(typeof r.settings_json === "string" ? safeJson(r.settings_json) : (r.settings_json || {})),
  };
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    mode: "SIMULATED",
    startingBalance: n(r.starting_balance),
    currentCash: n(r.current_cash),
    realisedPnl: n(r.realised_pnl),
    unrealisedPnl: n(r.unrealised_pnl),
    totalEquity: n(r.total_equity),
    baseCurrency: r.base_currency || "USD",
    status: r.status as ArcaPortfolioStatus,
    settings,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}
function safeJson(v: string): Record<string, unknown> {
  try {
    const j = JSON.parse(v);
    return j && typeof j === "object" ? j : {};
  } catch {
    return {};
  }
}
function mapOrder(r: any): ArcaSimOrder {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    portfolioId: r.portfolio_id,
    symbol: r.symbol,
    assetClass: r.asset_class,
    instrumentType: r.instrument_type,
    side: r.side,
    orderType: r.order_type,
    status: r.status,
    plannedEntry: nOrNull(r.planned_entry),
    triggerPrice: nOrNull(r.trigger_price),
    filledPrice: nOrNull(r.filled_price),
    quantity: n(r.quantity),
    notionalValue: nOrNull(r.notional_value),
    stopLoss: nOrNull(r.stop_loss),
    takeProfit1: nOrNull(r.take_profit_1),
    takeProfit2: nOrNull(r.take_profit_2),
    takeProfit3: nOrNull(r.take_profit_3),
    timeInForce: r.time_in_force,
    sourceEdgePacketId: sOrNull(r.source_edge_packet_id),
    sourceMarketPacketId: sOrNull(r.source_market_packet_id),
    playbookId: sOrNull(r.playbook_id),
    createdReason: sOrNull(r.created_reason),
    arcaConfidence: nOrNull(r.arca_confidence),
    createdAt: new Date(r.created_at).toISOString(),
    triggeredAt: r.triggered_at ? new Date(r.triggered_at).toISOString() : null,
    filledAt: r.filled_at ? new Date(r.filled_at).toISOString() : null,
    cancelledAt: r.cancelled_at ? new Date(r.cancelled_at).toISOString() : null,
  };
}
function mapPosition(r: any): ArcaPosition {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    portfolioId: r.portfolio_id,
    symbol: r.symbol,
    assetClass: r.asset_class,
    instrumentType: r.instrument_type,
    side: r.side,
    quantity: n(r.quantity),
    averageEntry: n(r.average_entry),
    currentPrice: nOrNull(r.current_price),
    stopLoss: nOrNull(r.stop_loss),
    takeProfit1: nOrNull(r.take_profit_1),
    takeProfit2: nOrNull(r.take_profit_2),
    takeProfit3: nOrNull(r.take_profit_3),
    realisedPnl: n(r.realised_pnl),
    unrealisedPnl: n(r.unrealised_pnl),
    openRisk: n(r.open_risk),
    currentRMultiple: nOrNull(r.current_r_multiple),
    status: r.status,
    openedAt: new Date(r.opened_at).toISOString(),
    lastMarkAt: r.last_mark_at ? new Date(r.last_mark_at).toISOString() : null,
    closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null,
    sourceOrderId: sOrNull(r.source_order_id),
    sourceEdgePacketId: sOrNull(r.source_edge_packet_id),
    playbookId: sOrNull(r.playbook_id),
  };
}
function mapTrade(r: any): ArcaTrade {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    portfolioId: r.portfolio_id,
    positionId: sOrNull(r.position_id),
    symbol: r.symbol,
    assetClass: r.asset_class,
    instrumentType: r.instrument_type,
    side: r.side,
    entryPrice: n(r.entry_price),
    exitPrice: n(r.exit_price),
    quantity: n(r.quantity),
    notionalValue: nOrNull(r.notional_value),
    stopLoss: nOrNull(r.stop_loss),
    takeProfit1: nOrNull(r.take_profit_1),
    takeProfit2: nOrNull(r.take_profit_2),
    takeProfit3: nOrNull(r.take_profit_3),
    entryTime: new Date(r.entry_time).toISOString(),
    exitTime: new Date(r.exit_time).toISOString(),
    realisedPnl: n(r.realised_pnl),
    rMultiple: nOrNull(r.r_multiple),
    feesEstimate: n(r.fees_estimate),
    slippageEstimate: n(r.slippage_estimate),
    outcome: r.outcome,
    exitReason: r.exit_reason,
    playbookId: sOrNull(r.playbook_id),
    sourceEdgePacketId: sOrNull(r.source_edge_packet_id),
    sourceMarketPacketId: sOrNull(r.source_market_packet_id),
    arcaConfidence: nOrNull(r.arca_confidence),
    arcaReasonSummary: sOrNull(r.arca_reason_summary),
    createdAt: new Date(r.created_at).toISOString(),
  };
}
function mapJournal(r: any): ArcaJournalEntry {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    portfolioId: r.portfolio_id,
    tradeId: sOrNull(r.trade_id),
    positionId: sOrNull(r.position_id),
    orderId: sOrNull(r.order_id),
    symbol: sOrNull(r.symbol),
    journalType: r.journal_type,
    title: r.title,
    arcaReasoning: sOrNull(r.arca_reasoning),
    evidence: arr(r.evidence),
    contradictionEvidence: arr(r.contradiction_evidence),
    bearCase: sOrNull(r.bear_case),
    dataFreshness: sOrNull(r.data_freshness),
    sourcePacketIds: arr(r.source_packet_ids),
    screenshotUrl: sOrNull(r.screenshot_url),
    bradNotes: sOrNull(r.brad_notes),
    lessons: sOrNull(r.lessons),
    createdAt: new Date(r.created_at).toISOString(),
  };
}
function mapRisk(r: any): ArcaRiskEvent {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    portfolioId: r.portfolio_id,
    eventType: r.event_type,
    severity: r.severity,
    message: r.message,
    affectedSymbol: sOrNull(r.affected_symbol),
    affectedPositionId: sOrNull(r.affected_position_id),
    value: nOrNull(r.value),
    threshold: nOrNull(r.threshold),
    acknowledged: !!r.acknowledged,
    acknowledgedAt: r.acknowledged_at ? new Date(r.acknowledged_at).toISOString() : null,
    createdAt: new Date(r.created_at).toISOString(),
  };
}
function mapSnapshot(r: any): ArcaPortfolioSnapshot {
  return {
    id: Number(r.id),
    workspaceId: r.workspace_id,
    portfolioId: r.portfolio_id,
    snapshotAt: new Date(r.snapshot_at).toISOString(),
    cash: n(r.cash),
    totalEquity: n(r.total_equity),
    realisedPnl: n(r.realised_pnl),
    unrealisedPnl: n(r.unrealised_pnl),
    dailyPnl: nOrNull(r.daily_pnl),
    drawdownPct: nOrNull(r.drawdown_pct),
    exposureEquities: n(r.exposure_equities),
    exposureCrypto: n(r.exposure_crypto),
    exposureCommodities: n(r.exposure_commodities),
    exposureOptions: n(r.exposure_options),
    exposureFutures: n(r.exposure_futures),
    openPositionsCount: Number(r.open_positions_count || 0),
    openRiskPct: nOrNull(r.open_risk_pct),
    createdAt: new Date(r.created_at).toISOString(),
  };
}

// ───────────────────────────────────────── portfolios

export async function getDefaultPortfolio(
  workspaceId: string,
  name: string,
): Promise<ArcaPortfolio | null> {
  const rows = await q<any>(
    `SELECT * FROM arca_portfolios WHERE workspace_id = $1 AND name = $2 LIMIT 1`,
    [workspaceId, name],
  );
  return rows[0] ? mapPortfolio(rows[0]) : null;
}

export async function listPortfolios(workspaceId: string): Promise<ArcaPortfolio[]> {
  const rows = await q<any>(
    `SELECT * FROM arca_portfolios WHERE workspace_id = $1 ORDER BY created_at ASC`,
    [workspaceId],
  );
  return rows.map(mapPortfolio);
}

export async function insertPortfolio(input: {
  workspaceId: string;
  name: string;
  startingBalance: number;
  baseCurrency: string;
  settings: ArcaPortfolioSettings;
}): Promise<ArcaPortfolio> {
  const rows = await q<any>(
    `INSERT INTO arca_portfolios
       (workspace_id, name, mode, starting_balance, current_cash,
        realised_pnl, unrealised_pnl, total_equity, base_currency,
        status, settings_json)
     VALUES ($1, $2, 'SIMULATED', $3, $3, 0, 0, $3, $4, 'ACTIVE', $5)
     RETURNING *`,
    [
      input.workspaceId,
      input.name,
      input.startingBalance,
      input.baseCurrency,
      JSON.stringify(input.settings),
    ],
  );
  return mapPortfolio(rows[0]);
}

export async function updatePortfolioBalances(input: {
  portfolioId: string;
  currentCash: number;
  realisedPnl: number;
  unrealisedPnl: number;
  totalEquity: number;
}): Promise<void> {
  await q(
    `UPDATE arca_portfolios SET current_cash = $1, realised_pnl = $2,
       unrealised_pnl = $3, total_equity = $4, updated_at = NOW()
     WHERE id = $5`,
    [
      input.currentCash,
      input.realisedPnl,
      input.unrealisedPnl,
      input.totalEquity,
      input.portfolioId,
    ],
  );
}

export async function updatePortfolioSettings(
  portfolioId: string,
  settings: ArcaPortfolioSettings,
): Promise<void> {
  await q(
    `UPDATE arca_portfolios SET settings_json = $1, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(settings), portfolioId],
  );
}

// ───────────────────────────────────────── orders

export async function insertSimOrder(input: {
  workspaceId: string;
  portfolioId: string;
  symbol: string;
  assetClass: string;
  instrumentType: string;
  side: string;
  orderType: string;
  status: SimOrderStatus;
  plannedEntry: number | null;
  triggerPrice: number | null;
  quantity: number;
  notionalValue: number | null;
  stopLoss: number | null;
  takeProfit1: number | null;
  takeProfit2: number | null;
  takeProfit3: number | null;
  sourceEdgePacketId: string | null;
  playbookId: string | null;
  createdReason: string | null;
  arcaConfidence: number | null;
}): Promise<ArcaSimOrder> {
  const rows = await q<any>(
    `INSERT INTO arca_simulated_orders
       (workspace_id, portfolio_id, symbol, asset_class, instrument_type,
        side, order_type, status, planned_entry, trigger_price, quantity,
        notional_value, stop_loss, take_profit_1, take_profit_2, take_profit_3,
        source_edge_packet_id, playbook_id, created_reason, arca_confidence)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     RETURNING *`,
    [
      input.workspaceId, input.portfolioId, input.symbol, input.assetClass, input.instrumentType,
      input.side, input.orderType, input.status, input.plannedEntry, input.triggerPrice, input.quantity,
      input.notionalValue, input.stopLoss, input.takeProfit1, input.takeProfit2, input.takeProfit3,
      input.sourceEdgePacketId, input.playbookId, input.createdReason, input.arcaConfidence,
    ],
  );
  return mapOrder(rows[0]);
}

export async function listOrders(
  workspaceId: string,
  portfolioId: string,
  opts: { status?: SimOrderStatus[]; limit?: number } = {},
): Promise<ArcaSimOrder[]> {
  const limit = Math.min(opts.limit ?? 200, 500);
  if (opts.status && opts.status.length > 0) {
    const rows = await q<any>(
      `SELECT * FROM arca_simulated_orders
        WHERE workspace_id = $1 AND portfolio_id = $2 AND status = ANY($3)
        ORDER BY created_at DESC LIMIT $4`,
      [workspaceId, portfolioId, opts.status, limit],
    );
    return rows.map(mapOrder);
  }
  const rows = await q<any>(
    `SELECT * FROM arca_simulated_orders
      WHERE workspace_id = $1 AND portfolio_id = $2
      ORDER BY created_at DESC LIMIT $3`,
    [workspaceId, portfolioId, limit],
  );
  return rows.map(mapOrder);
}

export async function updateSimOrderStatus(input: {
  orderId: string;
  status: SimOrderStatus;
  filledPrice?: number | null;
}): Promise<void> {
  const stamp =
    input.status === "TRIGGERED"
      ? "triggered_at = NOW()"
      : input.status === "FILLED_SIM"
      ? "filled_at = NOW(), triggered_at = COALESCE(triggered_at, NOW())"
      : input.status === "CANCELLED"
      ? "cancelled_at = NOW()"
      : "created_at = created_at";
  await q(
    `UPDATE arca_simulated_orders SET status = $1, filled_price = COALESCE($2, filled_price), ${stamp} WHERE id = $3`,
    [input.status, input.filledPrice ?? null, input.orderId],
  );
}

// ───────────────────────────────────────── positions

export async function insertPosition(input: {
  workspaceId: string;
  portfolioId: string;
  symbol: string;
  assetClass: string;
  instrumentType: string;
  side: "LONG" | "SHORT";
  quantity: number;
  averageEntry: number;
  stopLoss: number | null;
  takeProfit1: number | null;
  takeProfit2: number | null;
  takeProfit3: number | null;
  openRisk: number;
  sourceOrderId: string | null;
  sourceEdgePacketId: string | null;
  playbookId: string | null;
}): Promise<ArcaPosition> {
  const rows = await q<any>(
    `INSERT INTO arca_positions
       (workspace_id, portfolio_id, symbol, asset_class, instrument_type,
        side, quantity, average_entry, current_price, stop_loss,
        take_profit_1, take_profit_2, take_profit_3, open_risk,
        source_order_id, source_edge_packet_id, playbook_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING *`,
    [
      input.workspaceId, input.portfolioId, input.symbol, input.assetClass, input.instrumentType,
      input.side, input.quantity, input.averageEntry, input.stopLoss,
      input.takeProfit1, input.takeProfit2, input.takeProfit3, input.openRisk,
      input.sourceOrderId, input.sourceEdgePacketId, input.playbookId,
    ],
  );
  return mapPosition(rows[0]);
}

export async function listOpenPositions(
  workspaceId: string,
  portfolioId: string,
): Promise<ArcaPosition[]> {
  const rows = await q<any>(
    `SELECT * FROM arca_positions
      WHERE workspace_id = $1 AND portfolio_id = $2
        AND status NOT IN ('CLOSED','STOPPED','TARGET_HIT','EXPIRED','CLOSED_BY_RULE','INVALIDATED')
      ORDER BY opened_at DESC`,
    [workspaceId, portfolioId],
  );
  return rows.map(mapPosition);
}

export async function markPosition(input: {
  positionId: string;
  currentPrice: number;
  unrealisedPnl: number;
  currentRMultiple: number | null;
}): Promise<void> {
  await q(
    `UPDATE arca_positions
        SET current_price = $1, unrealised_pnl = $2,
            current_r_multiple = $3, last_mark_at = NOW()
      WHERE id = $4`,
    [input.currentPrice, input.unrealisedPnl, input.currentRMultiple, input.positionId],
  );
}

export async function closePositionRow(input: {
  positionId: string;
  status: PositionStatus;
  realisedPnl: number;
}): Promise<void> {
  await q(
    `UPDATE arca_positions
        SET status = $1, realised_pnl = $2, unrealised_pnl = 0,
            closed_at = NOW(), last_mark_at = NOW()
      WHERE id = $3`,
    [input.status, input.realisedPnl, input.positionId],
  );
}

// ───────────────────────────────────────── trades

export async function insertTrade(input: {
  workspaceId: string;
  portfolioId: string;
  positionId: string | null;
  symbol: string;
  assetClass: string;
  instrumentType: string;
  side: "LONG" | "SHORT";
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  notionalValue: number | null;
  stopLoss: number | null;
  takeProfit1: number | null;
  takeProfit2: number | null;
  takeProfit3: number | null;
  entryTime: string;
  exitTime: string;
  realisedPnl: number;
  rMultiple: number | null;
  feesEstimate: number;
  slippageEstimate: number;
  outcome: string;
  exitReason: string;
  playbookId: string | null;
  sourceEdgePacketId: string | null;
  arcaConfidence: number | null;
  arcaReasonSummary: string | null;
}): Promise<ArcaTrade> {
  const rows = await q<any>(
    `INSERT INTO arca_trades
       (workspace_id, portfolio_id, position_id, symbol, asset_class, instrument_type,
        side, entry_price, exit_price, quantity, notional_value,
        stop_loss, take_profit_1, take_profit_2, take_profit_3,
        entry_time, exit_time, realised_pnl, r_multiple, fees_estimate, slippage_estimate,
        outcome, exit_reason, playbook_id, source_edge_packet_id,
        arca_confidence, arca_reason_summary)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
     RETURNING *`,
    [
      input.workspaceId, input.portfolioId, input.positionId, input.symbol, input.assetClass, input.instrumentType,
      input.side, input.entryPrice, input.exitPrice, input.quantity, input.notionalValue,
      input.stopLoss, input.takeProfit1, input.takeProfit2, input.takeProfit3,
      input.entryTime, input.exitTime, input.realisedPnl, input.rMultiple, input.feesEstimate, input.slippageEstimate,
      input.outcome, input.exitReason, input.playbookId, input.sourceEdgePacketId,
      input.arcaConfidence, input.arcaReasonSummary,
    ],
  );
  return mapTrade(rows[0]);
}

export async function listTrades(
  workspaceId: string,
  portfolioId: string,
  opts: { limit?: number } = {},
): Promise<ArcaTrade[]> {
  const limit = Math.min(opts.limit ?? 200, 1000);
  const rows = await q<any>(
    `SELECT * FROM arca_trades
      WHERE workspace_id = $1 AND portfolio_id = $2
      ORDER BY exit_time DESC LIMIT $3`,
    [workspaceId, portfolioId, limit],
  );
  return rows.map(mapTrade);
}

// ───────────────────────────────────────── journal

export async function insertJournal(input: {
  workspaceId: string;
  portfolioId: string;
  tradeId?: string | null;
  positionId?: string | null;
  orderId?: string | null;
  symbol?: string | null;
  journalType: string;
  title: string;
  arcaReasoning?: string | null;
  evidence?: string[];
  contradictionEvidence?: string[];
  bearCase?: string | null;
  dataFreshness?: string | null;
  sourcePacketIds?: string[];
  lessons?: string | null;
}): Promise<ArcaJournalEntry> {
  const rows = await q<any>(
    `INSERT INTO arca_trade_journal
       (workspace_id, portfolio_id, trade_id, position_id, order_id, symbol,
        journal_type, title, arca_reasoning, evidence, contradiction_evidence,
        bear_case, data_freshness, source_packet_ids, lessons)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14::jsonb,$15)
     RETURNING *`,
    [
      input.workspaceId, input.portfolioId,
      input.tradeId ?? null, input.positionId ?? null, input.orderId ?? null,
      input.symbol ?? null, input.journalType, input.title,
      input.arcaReasoning ?? null,
      JSON.stringify(input.evidence ?? []),
      JSON.stringify(input.contradictionEvidence ?? []),
      input.bearCase ?? null, input.dataFreshness ?? null,
      JSON.stringify(input.sourcePacketIds ?? []),
      input.lessons ?? null,
    ],
  );
  return mapJournal(rows[0]);
}

export async function listJournal(
  workspaceId: string,
  portfolioId: string,
  opts: { limit?: number; symbol?: string; types?: string[] } = {},
): Promise<ArcaJournalEntry[]> {
  const limit = Math.min(opts.limit ?? 200, 500);
  const where: string[] = [`workspace_id = $1`, `portfolio_id = $2`];
  const params: any[] = [workspaceId, portfolioId];
  if (opts.symbol) {
    params.push(opts.symbol);
    where.push(`symbol = $${params.length}`);
  }
  if (opts.types && opts.types.length > 0) {
    params.push(opts.types);
    where.push(`journal_type = ANY($${params.length})`);
  }
  params.push(limit);
  const rows = await q<any>(
    `SELECT * FROM arca_trade_journal WHERE ${where.join(" AND ")}
      ORDER BY created_at DESC LIMIT $${params.length}`,
    params,
  );
  return rows.map(mapJournal);
}

// ───────────────────────────────────────── risk events

export async function insertRiskEvent(input: {
  workspaceId: string;
  portfolioId: string;
  eventType: string;
  severity: string;
  message: string;
  affectedSymbol?: string | null;
  affectedPositionId?: string | null;
  value?: number | null;
  threshold?: number | null;
}): Promise<ArcaRiskEvent> {
  const rows = await q<any>(
    `INSERT INTO arca_risk_events
       (workspace_id, portfolio_id, event_type, severity, message,
        affected_symbol, affected_position_id, value, threshold)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      input.workspaceId, input.portfolioId, input.eventType, input.severity, input.message,
      input.affectedSymbol ?? null, input.affectedPositionId ?? null,
      input.value ?? null, input.threshold ?? null,
    ],
  );
  return mapRisk(rows[0]);
}

export async function listRiskEvents(
  workspaceId: string,
  portfolioId: string,
  opts: { onlyUnacknowledged?: boolean; limit?: number } = {},
): Promise<ArcaRiskEvent[]> {
  const limit = Math.min(opts.limit ?? 100, 500);
  const where: string[] = [`workspace_id = $1`, `portfolio_id = $2`];
  const params: any[] = [workspaceId, portfolioId];
  if (opts.onlyUnacknowledged) where.push(`acknowledged = FALSE`);
  params.push(limit);
  const rows = await q<any>(
    `SELECT * FROM arca_risk_events WHERE ${where.join(" AND ")}
      ORDER BY created_at DESC LIMIT $${params.length}`,
    params,
  );
  return rows.map(mapRisk);
}

export async function acknowledgeRiskEvent(workspaceId: string, eventId: string): Promise<void> {
  await q(
    `UPDATE arca_risk_events SET acknowledged = TRUE, acknowledged_at = NOW()
       WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, eventId],
  );
}

// ───────────────────────────────────────── snapshots

export async function insertSnapshot(input: {
  workspaceId: string;
  portfolioId: string;
  cash: number;
  totalEquity: number;
  realisedPnl: number;
  unrealisedPnl: number;
  dailyPnl: number | null;
  drawdownPct: number | null;
  exposureEquities: number;
  exposureCrypto: number;
  exposureCommodities: number;
  exposureOptions: number;
  exposureFutures: number;
  openPositionsCount: number;
  openRiskPct: number | null;
}): Promise<void> {
  await q(
    `INSERT INTO arca_portfolio_snapshots
       (workspace_id, portfolio_id, cash, total_equity, realised_pnl,
        unrealised_pnl, daily_pnl, drawdown_pct,
        exposure_equities, exposure_crypto, exposure_commodities,
        exposure_options, exposure_futures, open_positions_count, open_risk_pct)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      input.workspaceId, input.portfolioId, input.cash, input.totalEquity, input.realisedPnl,
      input.unrealisedPnl, input.dailyPnl, input.drawdownPct,
      input.exposureEquities, input.exposureCrypto, input.exposureCommodities,
      input.exposureOptions, input.exposureFutures, input.openPositionsCount, input.openRiskPct,
    ],
  );
}

export async function listSnapshots(
  workspaceId: string,
  portfolioId: string,
  opts: { limit?: number } = {},
): Promise<ArcaPortfolioSnapshot[]> {
  const limit = Math.min(opts.limit ?? 365, 1000);
  const rows = await q<any>(
    `SELECT * FROM arca_portfolio_snapshots
      WHERE workspace_id = $1 AND portfolio_id = $2
      ORDER BY snapshot_at DESC LIMIT $3`,
    [workspaceId, portfolioId, limit],
  );
  return rows.map(mapSnapshot);
}
