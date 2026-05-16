/**
 * lib/admin/portfolio-lab/types.ts
 *
 * ARCA Portfolio Lab — admin-only SIMULATED paper trading.
 * NEVER routes real orders. All "fills" are calculated from
 * AdminEdgePacket decision levels and AdminMarketPacket prices.
 */

export type ArcaPortfolioMode = "SIMULATED";
export type ArcaPortfolioStatus = "ACTIVE" | "PAUSED" | "ARCHIVED";
export type ArcaAssetClass =
  | "equity"
  | "crypto"
  | "commodity"
  | "options"
  | "futures";

export type SimOrderSide = "BUY" | "SELL" | "LONG" | "SHORT";
export type PositionSide = "LONG" | "SHORT";

export type SimOrderType = "MARKET_SIM" | "LIMIT_SIM" | "STOP_SIM";

export type SimOrderStatus =
  | "PLANNED"
  | "WAITING_FOR_TRIGGER"
  | "TRIGGERED"
  | "FILLED_SIM"
  | "CANCELLED"
  | "EXPIRED"
  | "INVALIDATED_BEFORE_FILL";

export type PositionStatus =
  | "OPEN"
  | "PARTIAL_TP1"
  | "PARTIAL_TP2"
  | "RUNNER"
  | "STOPPED"
  | "TARGET_HIT"
  | "CLOSED_BY_RULE"
  | "INVALIDATED"
  | "EXPIRED"
  | "CLOSED";

export type TradeOutcome = "WIN" | "LOSS" | "BREAKEVEN" | "PARTIAL" | "OPEN";
export type TradeExitReason =
  | "STOP_LOSS"
  | "TAKE_PROFIT"
  | "TIME_EXIT"
  | "SIGNAL_INVALIDATED"
  | "MANUAL_SIM_CLOSE"
  | "RULE_EXIT";

export type JournalType =
  | "ENTRY"
  | "UPDATE"
  | "EXIT"
  | "REVIEW"
  | "ERROR"
  | "OVERRIDE"
  | "REJECTED"
  | "RISK_BLOCK";

export type RiskSeverity = "info" | "warning" | "critical" | "kill_switch";

// ─────────── Portfolio settings (JSONB in DB) ───────────

export interface ArcaPortfolioSettings {
  riskPerTradePct: number;                // default 0.75
  maxSingleTradeRiskPct: number;          // hard cap 1.0
  maxOpenPortfolioRiskPct: number;        // hard cap 5.0
  maxAssetClassExposurePct: {
    equity: number;
    crypto: number;
    commodity: number;
    options: number;
    futures: number;
  };
  maxCorrelatedThemeExposurePct: number;  // default 20
  maxTradesPerDay: number;                // default 10
  losingStreakWarn: number;               // default 3
  dailyDrawdownWarnPct: number;           // default 2
  hardDrawdownWarnPct: number;            // default 5
  feesPctEstimate: number;                // default 0.05
  slippagePctEstimate: number;            // default 0.05
  enabledAssetClasses: ArcaAssetClass[];
  enabledPlaybooks: string[] | null;      // null = all
  minEdgePacketRankScore: number;         // default 65
  minEvidenceQualityScore: number;        // default 60
  benchmarkSymbol: string;                // default "SPY"
}

// ─────────── Domain rows (TS-side) ───────────

export interface ArcaPortfolio {
  id: string;
  workspaceId: string;
  name: string;
  mode: ArcaPortfolioMode;
  startingBalance: number;
  currentCash: number;
  realisedPnl: number;
  unrealisedPnl: number;
  totalEquity: number;
  baseCurrency: string;
  status: ArcaPortfolioStatus;
  settings: ArcaPortfolioSettings;
  createdAt: string;
  updatedAt: string;
}

export interface ArcaSimOrder {
  id: string;
  workspaceId: string;
  portfolioId: string;
  symbol: string;
  assetClass: ArcaAssetClass;
  instrumentType: string;
  side: SimOrderSide;
  orderType: SimOrderType;
  status: SimOrderStatus;
  plannedEntry: number | null;
  triggerPrice: number | null;
  filledPrice: number | null;
  quantity: number;
  notionalValue: number | null;
  stopLoss: number | null;
  takeProfit1: number | null;
  takeProfit2: number | null;
  takeProfit3: number | null;
  timeInForce: string;
  sourceEdgePacketId: string | null;
  sourceMarketPacketId: string | null;
  playbookId: string | null;
  createdReason: string | null;
  arcaConfidence: number | null;
  createdAt: string;
  triggeredAt: string | null;
  filledAt: string | null;
  cancelledAt: string | null;
}

export interface ArcaPosition {
  id: string;
  workspaceId: string;
  portfolioId: string;
  symbol: string;
  assetClass: ArcaAssetClass;
  instrumentType: string;
  side: PositionSide;
  quantity: number;
  averageEntry: number;
  currentPrice: number | null;
  stopLoss: number | null;
  takeProfit1: number | null;
  takeProfit2: number | null;
  takeProfit3: number | null;
  realisedPnl: number;
  unrealisedPnl: number;
  openRisk: number;
  currentRMultiple: number | null;
  status: PositionStatus;
  openedAt: string;
  lastMarkAt: string | null;
  closedAt: string | null;
  sourceOrderId: string | null;
  sourceEdgePacketId: string | null;
  playbookId: string | null;
}

export interface ArcaTrade {
  id: string;
  workspaceId: string;
  portfolioId: string;
  positionId: string | null;
  symbol: string;
  assetClass: ArcaAssetClass;
  instrumentType: string;
  side: PositionSide;
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
  outcome: TradeOutcome;
  exitReason: TradeExitReason;
  playbookId: string | null;
  sourceEdgePacketId: string | null;
  sourceMarketPacketId: string | null;
  arcaConfidence: number | null;
  arcaReasonSummary: string | null;
  createdAt: string;
}

export interface ArcaJournalEntry {
  id: string;
  workspaceId: string;
  portfolioId: string;
  tradeId: string | null;
  positionId: string | null;
  orderId: string | null;
  symbol: string | null;
  journalType: JournalType;
  title: string;
  arcaReasoning: string | null;
  evidence: string[];
  contradictionEvidence: string[];
  bearCase: string | null;
  dataFreshness: string | null;
  sourcePacketIds: string[];
  screenshotUrl: string | null;
  bradNotes: string | null;
  lessons: string | null;
  createdAt: string;
}

export interface ArcaRiskEvent {
  id: string;
  workspaceId: string;
  portfolioId: string;
  eventType: string;
  severity: RiskSeverity;
  message: string;
  affectedSymbol: string | null;
  affectedPositionId: string | null;
  value: number | null;
  threshold: number | null;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  createdAt: string;
}

export interface ArcaPortfolioSnapshot {
  id: number;
  workspaceId: string;
  portfolioId: string;
  snapshotAt: string;
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
  createdAt: string;
}

// ─────────── Cycle result ───────────

export interface SimulateCycleResult {
  portfolioId: string;
  cycleAt: string;
  ordersCreated: number;
  ordersTriggered: number;
  ordersCancelled: number;
  positionsOpened: number;
  positionsMarked: number;
  positionsClosed: number;
  riskEventsCreated: number;
  rejections: number;
  notes: string[];
  benchmarkCaptured?: boolean;
  benchmarkSymbol?: string;
  playbooksUpdated?: number;
}
