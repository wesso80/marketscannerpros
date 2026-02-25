/**
 * Shared server-side execution pipeline.
 *
 * Fetches ATR → builds exit plan → evaluates governor → computes sizing & leverage.
 * Called by every auto-trade-creation route so that ALL journal entries get
 * proper stop-loss, targets, trail rules, and position sizing.
 */

import { q } from '@/lib/db';
import { buildPermissionSnapshot } from '@/lib/risk-governor-hard';
import { computeEntryRiskMetrics, getLatestPortfolioEquity } from '@/lib/journal/riskAtEntry';
import { buildExitPlan } from '@/lib/execution/exits';
import { computePositionSize } from '@/lib/execution/positionSizing';
import { computeLeverage } from '@/lib/execution/leverage';
import { evaluateGovernor } from '@/lib/execution/riskGovernor';
import { fetchATR } from '@/lib/execution/fetchATR';
import type {
  TradeIntent,
  AssetClass,
  ExitPlan,
  PositionSizingResult,
  LeverageResult,
  GovernorDecision,
} from '@/lib/execution/types';
import type { Regime, StrategyTag, Direction } from '@/lib/risk-governor-hard';

/* ------------------------------------------------------------------ */
/*  Input / Output types                                               */
/* ------------------------------------------------------------------ */

export interface PipelineInput {
  workspaceId: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  assetClass: 'crypto' | 'equity' | 'forex' | 'commodity';
  /** 0-100 confidence/edge score */
  confidence?: number;
  /** Human-readable regime string — mapped internally */
  regime?: string;
  /** Strategy tag override — mapped internally */
  strategyTag?: string;
  /** Pre-fetched ATR — pipeline fetches if null */
  atr?: number | null;
  /** Whether the risk guard cookie is enabled */
  guardEnabled?: boolean;
}

export interface PipelineResult {
  exits: ExitPlan;
  sizing: PositionSizingResult;
  leverage: LeverageResult;
  governor: GovernorDecision;
  atr: number;
  entryRisk: {
    normalizedR: number;
    dynamicR: number;
    riskPerTradeAtEntry: number;
    equityAtEntry: number;
  };
  tradeType: string;
  accountEquity: number;
  intent: TradeIntent;
  engineRegime: Regime;
  engineStrategy: StrategyTag;
}

export type PipelineOutcome =
  | { ok: true; result: PipelineResult }
  | { ok: false; reason: string; code: 'NO_ATR' | 'BAD_EXITS' | 'GOVERNOR_BLOCK' | 'RISK_LOCKED' };

/* ------------------------------------------------------------------ */
/*  Mappings                                                           */
/* ------------------------------------------------------------------ */

const REGIME_MAP: Record<string, Regime> = {
  trend: 'TREND_UP',
  'trend up': 'TREND_UP',
  trend_up: 'TREND_UP',
  bullish: 'TREND_UP',
  'trend down': 'TREND_DOWN',
  trend_down: 'TREND_DOWN',
  bearish: 'TREND_DOWN',
  range: 'RANGE_NEUTRAL',
  range_neutral: 'RANGE_NEUTRAL',
  neutral: 'RANGE_NEUTRAL',
  'volatility expansion': 'VOL_EXPANSION',
  vol_expansion: 'VOL_EXPANSION',
  'volatility contraction': 'VOL_CONTRACTION',
  vol_contraction: 'VOL_CONTRACTION',
  'risk off': 'RISK_OFF_STRESS',
  risk_off_stress: 'RISK_OFF_STRESS',
  defensive: 'RISK_OFF_STRESS',
};

const STRATEGY_MAP: Record<string, StrategyTag> = {
  scanner_signal: 'TREND_PULLBACK',
  strategy_signal: 'BREAKOUT_CONTINUATION',
  alert_intelligence: 'MOMENTUM_REVERSAL',
  confluence_scan: 'TREND_PULLBACK',
  focus_plan: 'TREND_PULLBACK',
  operator_signal: 'BREAKOUT_CONTINUATION',
};

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

export async function runExecutionPipeline(input: PipelineInput): Promise<PipelineOutcome> {
  const {
    workspaceId,
    symbol,
    side,
    entryPrice,
    assetClass,
    confidence = 50,
    regime: regimeStr = 'RANGE_NEUTRAL',
    strategyTag: strategyStr = 'alert_intelligence',
    atr: providedAtr = null,
    guardEnabled = true,
  } = input;

  const safeAssetClass = assetClass === 'commodity' ? 'equity' : assetClass;
  const engineRegime: Regime = REGIME_MAP[regimeStr.toLowerCase()] ?? 'RANGE_NEUTRAL';
  const engineStrategy: StrategyTag = STRATEGY_MAP[strategyStr.toLowerCase()] ?? 'TREND_PULLBACK';
  const direction: Direction = side;

  // ── 1. ATR ──────────────────────────────────────────────────────────
  let atr: number;
  if (Number.isFinite(providedAtr) && (providedAtr as number) > 0) {
    atr = providedAtr as number;
  } else {
    const fetched = await fetchATR(symbol, assetClass);
    if (!fetched || fetched <= 0) {
      return { ok: false, reason: `No ATR available for ${symbol} — cannot compute exit strategy.`, code: 'NO_ATR' };
    }
    atr = fetched;
  }

  // ── 2. Account equity ──────────────────────────────────────────────
  const equityAtEntry = await getLatestPortfolioEquity(workspaceId);
  const accountEquity = equityAtEntry ?? 100_000;

  // ── 3. Build intent ────────────────────────────────────────────────
  const intent: TradeIntent = {
    symbol,
    asset_class: safeAssetClass as AssetClass,
    direction,
    strategy_tag: engineStrategy,
    confidence,
    regime: engineRegime,
    entry_price: entryPrice,
    atr,
    account_equity: accountEquity,
  };

  // Get open positions for correlation check
  const openRows = await q<{ symbol: string; side: string; asset_class: string }>(
    `SELECT symbol, side, asset_class FROM journal_entries WHERE workspace_id = $1 AND is_open = true`,
    [workspaceId],
  );
  intent.open_positions = openRows.map((r) => ({
    symbol: r.symbol,
    direction: r.side.toUpperCase() as Direction,
    asset_class: (r.asset_class || 'equity') as AssetClass,
  }));

  // ── 4. Exit plan ──────────────────────────────────────────────────
  const exits = buildExitPlan({
    direction,
    entry_price: entryPrice,
    atr,
    asset_class: intent.asset_class,
    regime: engineRegime,
    strategy_tag: engineStrategy,
  });

  // Validate exits
  const stopOk = Number.isFinite(exits.stop_price) && exits.stop_price > 0;
  const tpOk = Number.isFinite(exits.take_profit_1) && exits.take_profit_1 > 0;
  const rrOk = Number.isFinite(exits.rr_at_tp1) && exits.rr_at_tp1 >= 1;
  if (!stopOk || !tpOk || !rrOk) {
    return {
      ok: false,
      reason: `Exit strategy invalid for ${symbol} — stop: ${exits.stop_price}, tp1: ${exits.take_profit_1}, R:R ${exits.rr_at_tp1}.`,
      code: 'BAD_EXITS',
    };
  }

  // ── 5. Governor ───────────────────────────────────────────────────
  const snapshot = buildPermissionSnapshot({ enabled: guardEnabled });

  if (snapshot.risk_mode === 'LOCKED') {
    return { ok: false, reason: 'Risk governor is LOCKED — no new entries.', code: 'RISK_LOCKED' };
  }

  const dailyLossRows = await q<{ daily_loss: string }>(
    `SELECT COALESCE(SUM(pl), 0) AS daily_loss FROM journal_entries
     WHERE workspace_id = $1 AND is_open = false AND exit_date::date = CURRENT_DATE`,
    [workspaceId],
  );
  const dailyLossPct = accountEquity > 0
    ? Math.abs(Number(dailyLossRows[0]?.daily_loss ?? 0)) / accountEquity
    : 0;
  const openCount = openRows.length;
  const portfolioHeatRows = await q<{ total_risk: string }>(
    `SELECT COALESCE(SUM(risk_amount), 0)::text AS total_risk FROM journal_entries
     WHERE workspace_id = $1 AND is_open = true`,
    [workspaceId],
  );
  const portfolioHeat = accountEquity > 0
    ? Number(portfolioHeatRows[0]?.total_risk ?? 0) / accountEquity
    : 0;

  const governor = await evaluateGovernor(intent, exits, {
    snapshot,
    current_daily_loss_pct: dailyLossPct,
    current_portfolio_heat_pct: portfolioHeat,
    current_open_trade_count: openCount,
  });

  if (!governor.allowed) {
    return {
      ok: false,
      reason: `Execution engine blocked: ${governor.reason_codes.join(', ')}`,
      code: 'GOVERNOR_BLOCK',
    };
  }

  // ── 6. Leverage ───────────────────────────────────────────────────
  const atrPct = entryPrice > 0 ? (atr / entryPrice) * 100 : 2;
  const leverageResult = computeLeverage({
    asset_class: intent.asset_class,
    regime: engineRegime,
    risk_mode: governor.risk_mode,
    atr_percent: atrPct,
  });

  // ── 7. Position sizing ────────────────────────────────────────────
  const sizing = computePositionSize(intent, {
    governor_risk_per_trade: governor.risk_per_trade,
    governor_max_position_size: governor.max_position_size,
    effective_leverage: leverageResult.recommended_leverage,
  });

  // ── 8. Entry risk metrics ─────────────────────────────────────────
  const rawEntryRisk = computeEntryRiskMetrics({
    equityAtEntry: accountEquity,
    dynamicRiskPerTrade: sizing.risk_pct,
  });
  const entryRisk = {
    normalizedR: rawEntryRisk.normalizedR ?? 0,
    dynamicR: rawEntryRisk.dynamicR ?? 0,
    riskPerTradeAtEntry: rawEntryRisk.riskPerTradeAtEntry,
    equityAtEntry: rawEntryRisk.equityAtEntry ?? accountEquity,
  };

  // ── 9. Trade type ─────────────────────────────────────────────────
  let tradeType = 'Spot';
  if (leverageResult.recommended_leverage > 1) tradeType = 'Margin';

  return {
    ok: true,
    result: {
      exits,
      sizing,
      leverage: leverageResult,
      governor,
      atr,
      entryRisk,
      tradeType,
      accountEquity,
      intent,
      engineRegime,
      engineStrategy,
    },
  };
}
