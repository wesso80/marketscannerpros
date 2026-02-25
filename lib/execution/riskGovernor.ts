/**
 * Execution Engine — Risk Governor (execution layer)
 *
 * Wraps the hard governor (risk-governor-hard.ts) with execution-specific
 * checks: max daily loss USD, portfolio heat, and required R:R floor.
 */

import {
  buildPermissionSnapshot,
  evaluateCandidate,
  type CandidateIntent,
  type PermissionMatrixSnapshot,
} from '@/lib/risk-governor-hard';
import type { TradeIntent, GovernorDecision, ExitPlan } from './types';

/* ------------------------------------------------------------------ */
/*  Hard Limits                                                        */
/* ------------------------------------------------------------------ */

const MAX_DAILY_LOSS_PCT = 0.02;          // 2% of equity
const MAX_PORTFOLIO_HEAT_PCT = 0.06;      // 6% open risk
const MIN_REQUIRED_RR = 1.5;             // must offer at least 1.5:1
const MAX_OPEN_TRADES = 8;               // hard cap
const MAX_SINGLE_TRADE_RISK_PCT = 0.02;  // 2% of equity per trade

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

export async function evaluateGovernor(
  intent: TradeIntent,
  exits: ExitPlan,
  opts?: {
    snapshot?: PermissionMatrixSnapshot;
    current_daily_loss_pct?: number;
    current_portfolio_heat_pct?: number;
    current_open_trade_count?: number;
  },
): Promise<GovernorDecision> {
  const snapshot = opts?.snapshot ?? buildPermissionSnapshot();

  // Map TradeIntent → CandidateIntent for hard governor
  const candidate: CandidateIntent = {
    symbol: intent.symbol,
    asset_class: intent.asset_class === 'crypto' ? 'crypto' : 'equities',
    strategy_tag: intent.strategy_tag,
    direction: intent.direction,
    confidence: intent.confidence,
    entry_price: intent.entry_price,
    stop_price: exits.stop_price,
    atr: intent.atr,
    event_severity: intent.event_severity,
    open_positions: intent.open_positions?.map((p) => ({
      symbol: p.symbol,
      direction: p.direction,
      asset_class: p.asset_class === 'crypto' ? 'crypto' : 'equities',
    })),
  };

  const raw = evaluateCandidate(snapshot, candidate);

  // Start with the hard governor's verdict
  const reasonCodes = [...raw.reason_codes];
  const requiredActions = [...raw.required_actions];
  let allowed = raw.permission === 'ALLOW' || raw.permission === 'ALLOW_REDUCED' || raw.permission === 'ALLOW_TIGHTENED';

  // ── Execution-layer hard blocks ──────────────────────────────────

  // 1. Daily loss cap
  const dailyLoss = opts?.current_daily_loss_pct ?? 0;
  if (dailyLoss >= MAX_DAILY_LOSS_PCT) {
    allowed = false;
    reasonCodes.push('EXEC_DAILY_LOSS_CAP');
    requiredActions.push(`Daily loss ${(dailyLoss * 100).toFixed(2)}% ≥ ${(MAX_DAILY_LOSS_PCT * 100).toFixed(1)}% cap — no new trades.`);
  }

  // 2. Portfolio heat (total open risk)
  const heat = opts?.current_portfolio_heat_pct ?? 0;
  if (heat >= MAX_PORTFOLIO_HEAT_PCT) {
    allowed = false;
    reasonCodes.push('EXEC_PORTFOLIO_HEAT');
    requiredActions.push(`Portfolio heat ${(heat * 100).toFixed(2)}% ≥ ${(MAX_PORTFOLIO_HEAT_PCT * 100).toFixed(1)}% — reduce open risk.`);
  }

  // 3. Open trade count
  const openCount = opts?.current_open_trade_count ?? 0;
  if (openCount >= MAX_OPEN_TRADES) {
    allowed = false;
    reasonCodes.push('EXEC_MAX_OPEN_TRADES');
    requiredActions.push(`${openCount} open trades ≥ ${MAX_OPEN_TRADES} hard cap.`);
  }

  // 4. Minimum R:R check
  if (exits.rr_at_tp1 < MIN_REQUIRED_RR) {
    allowed = false;
    reasonCodes.push('EXEC_MIN_RR');
    requiredActions.push(`R:R at TP1 ${exits.rr_at_tp1.toFixed(2)} < ${MIN_REQUIRED_RR} minimum.`);
  }

  // 5. Single trade risk cap
  const equity = intent.account_equity ?? 100_000;
  const riskPct = intent.risk_pct ?? raw.risk_per_trade;
  if (riskPct > MAX_SINGLE_TRADE_RISK_PCT) {
    allowed = false;
    reasonCodes.push('EXEC_SINGLE_TRADE_RISK');
    requiredActions.push(`Risk per trade ${(riskPct * 100).toFixed(2)}% > ${(MAX_SINGLE_TRADE_RISK_PCT * 100).toFixed(1)}% cap.`);
  }

  return {
    allowed,
    permission: raw.permission,
    risk_mode: raw.risk_mode,
    risk_per_trade: raw.risk_per_trade,
    max_position_size: raw.max_position_size,
    reason_codes: reasonCodes,
    required_actions: requiredActions,
    raw,
  };
}

/* ------------------------------------------------------------------ */
/*  Convenience: quick allow/block check (no async, no exit plan)      */
/* ------------------------------------------------------------------ */

export function quickGovernorCheck(
  snapshot: PermissionMatrixSnapshot,
  intent: TradeIntent,
): { allowed: boolean; reason_codes: string[] } {
  const candidate: CandidateIntent = {
    symbol: intent.symbol,
    asset_class: intent.asset_class === 'crypto' ? 'crypto' : 'equities',
    strategy_tag: intent.strategy_tag,
    direction: intent.direction,
    confidence: intent.confidence,
    entry_price: intent.entry_price,
    stop_price: intent.stop_price ?? intent.entry_price * (intent.direction === 'LONG' ? 0.98 : 1.02),
    atr: intent.atr,
    event_severity: intent.event_severity,
  };

  const r = evaluateCandidate(snapshot, candidate);
  return {
    allowed: r.permission !== 'BLOCK',
    reason_codes: r.reason_codes,
  };
}
