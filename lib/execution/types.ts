/**
 * Execution Engine — Core Types
 *
 * Canonical types for the trade-proposal → execute pipeline.
 * Re-uses StrategyTag, Direction, Regime, Permission from risk-governor-hard
 * and TradeAssetClass from types/journal.
 */

import type {
  StrategyTag,
  Direction,
  Regime,
  Permission,
  RiskMode,
  EvaluateResult,
} from '@/lib/risk-governor-hard';
import type { TradeAssetClass } from '@/types/journal';

/* ------------------------------------------------------------------ */
/*  Enums / Literals                                                   */
/* ------------------------------------------------------------------ */

/** Extended asset class list (adds futures/forex to journal's set) */
export type AssetClass = TradeAssetClass | 'futures' | 'forex';

export type OrderType = 'MARKET' | 'LIMIT' | 'STOP_LIMIT';
export type TimeInForce = 'GTC' | 'DAY' | 'IOC' | 'FOK';

export type OptionsStructure =
  | 'NONE'
  | 'LONG_CALL'
  | 'LONG_PUT'
  | 'CALL_DEBIT_SPREAD'
  | 'PUT_DEBIT_SPREAD'
  | 'IRON_CONDOR'
  | 'STRADDLE'
  | 'STRANGLE';

export type TrailRule =
  | 'NONE'
  | 'ATR_1X'
  | 'ATR_1_5X'
  | 'ATR_2X'
  | 'BREAKEVEN_AFTER_1R'
  | 'CHANDELIER'
  | 'PERCENT_TRAIL';

export type ExecutionMode = 'DRY_RUN' | 'PAPER' | 'LIVE';

/* ------------------------------------------------------------------ */
/*  Trade Intent  (what the user / scanner wants to do)                */
/* ------------------------------------------------------------------ */

export interface TradeIntent {
  symbol: string;
  asset_class: AssetClass;
  direction: Direction;
  strategy_tag: StrategyTag;
  confidence: number;         // 0-100
  regime: Regime;
  entry_price: number;
  atr: number;
  /** Optional override — if absent, engine computes from ATR */
  stop_price?: number;
  event_severity?: 'none' | 'medium' | 'high';
  /** For options */
  options_dte?: number;
  options_delta?: number;
  options_structure?: OptionsStructure;
  /** Account equity override (pulls from DB if omitted) */
  account_equity?: number;
  /** Risk pct override — default 0.75% (BASE_RISK in governor) */
  risk_pct?: number;
  /** Leverage override — default from leverage module */
  leverage?: number;
  /** Existing open positions for correlation check */
  open_positions?: Array<{
    symbol: string;
    direction: Direction;
    asset_class?: AssetClass;
  }>;
}

/* ------------------------------------------------------------------ */
/*  Position Sizing Result                                             */
/* ------------------------------------------------------------------ */

export interface PositionSizingResult {
  /** Number of shares / contracts / coins */
  quantity: number;
  /** Fractional quantity before rounding (for transparency) */
  raw_quantity: number;
  /** Dollar risk per unit */
  risk_per_unit: number;
  /** Total dollar risk */
  total_risk_usd: number;
  /** Account equity used for computation */
  account_equity: number;
  /** Effective risk pct used */
  risk_pct: number;
  /** Notional exposure  = entry × quantity × leverage */
  notional_usd: number;
  /** Effective leverage */
  leverage: number;
}

/* ------------------------------------------------------------------ */
/*  Exit Plan                                                          */
/* ------------------------------------------------------------------ */

export interface ExitPlan {
  stop_price: number;
  take_profit_1: number;
  take_profit_2?: number;
  trail_rule: TrailRule;
  /** Max time to hold in minutes (0 = no limit) */
  time_stop_minutes: number;
  /** Risk:reward at TP1 */
  rr_at_tp1: number;
  /** Risk:reward at TP2 */
  rr_at_tp2?: number;
}

/* ------------------------------------------------------------------ */
/*  Options Selection                                                  */
/* ------------------------------------------------------------------ */

export interface OptionsSelection {
  structure: OptionsStructure;
  dte: number;
  delta: number;
  strike?: number;
  premium_est?: number;
  max_loss_usd?: number;
  notes: string;
}

/* ------------------------------------------------------------------ */
/*  Leverage Recommendation                                            */
/* ------------------------------------------------------------------ */

export interface LeverageResult {
  max_leverage: number;
  recommended_leverage: number;
  capped: boolean;
  cap_reason?: string;
}

/* ------------------------------------------------------------------ */
/*  Governor Decision (wrapper around hard governor's EvaluateResult)  */
/* ------------------------------------------------------------------ */

export interface GovernorDecision {
  allowed: boolean;
  permission: Permission;
  risk_mode: RiskMode;
  risk_per_trade: number;
  max_position_size: number;
  reason_codes: string[];
  required_actions: string[];
  /** Full hard-governor result for transparency */
  raw: EvaluateResult;
}

/* ------------------------------------------------------------------ */
/*  Order (broker-ready instruction)                                   */
/* ------------------------------------------------------------------ */

export interface OrderInstruction {
  symbol: string;
  side: 'BUY' | 'SELL';
  order_type: OrderType;
  time_in_force: TimeInForce;
  quantity: number;
  limit_price?: number;
  stop_price?: number;
  /** Bracket orders */
  bracket_stop?: number;
  bracket_tp1?: number;
  bracket_tp2?: number;
  leverage?: number;
  asset_class: AssetClass;
  /** Options-specific */
  option_type?: 'CALL' | 'PUT';
  strike?: number;
  expiration?: string;   // ISO date
  /** Metadata */
  client_order_id: string;
  proposal_id: string;
}

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

export interface ValidationError {
  field: string;
  code: string;
  message: string;
}

/* ------------------------------------------------------------------ */
/*  Trade Proposal  (full decision object)                             */
/* ------------------------------------------------------------------ */

export interface TradeProposal {
  proposal_id: string;
  ts: string;
  intent: TradeIntent;
  governor: GovernorDecision;
  sizing: PositionSizingResult;
  exits: ExitPlan;
  leverage: LeverageResult;
  options?: OptionsSelection;
  order: OrderInstruction;
  validation_errors: ValidationError[];
  /** Overall verdict: can this trade go ahead? */
  executable: boolean;
  /** Human-readable summary */
  summary: string;
}

/* ------------------------------------------------------------------ */
/*  Execution Result                                                   */
/* ------------------------------------------------------------------ */

export interface ExecutionResult {
  proposal_id: string;
  mode: ExecutionMode;
  success: boolean;
  /** Journal entry ID if written */
  journal_entry_id?: number;
  /** Broker order ID if sent */
  broker_order_id?: string;
  /** Error message if failed */
  error?: string;
  ts: string;
}
