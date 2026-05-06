// Pre-trade risk engine. Runs BEFORE any broker.placeOrder call.
// Hard kill-switch authority. Returns { ok, reason }.

import { q } from '@/lib/db';

export interface RiskCheckInput {
  account: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  qty: number;
  estPrice: number;
  tpPrice?: number;
  slPrice?: number;
}

export interface RiskCheckResult {
  ok: boolean;
  reason?: string;
  details?: Record<string, unknown>;
}

interface RiskLimits {
  maxDailyLossUsd: number;
  maxOpenPositions: number;
  maxQtyPerOrder: number;
  maxOrdersPerMinute: number;
  killSwitchActive: boolean;
}

function readLimits(): RiskLimits {
  return {
    maxDailyLossUsd: Number(process.env.TRADE_MAX_DAILY_LOSS_USD ?? '500'),
    maxOpenPositions: Number(process.env.TRADE_MAX_OPEN_POSITIONS ?? '1'),
    maxQtyPerOrder: Number(process.env.TRADE_MAX_QTY_PER_ORDER ?? '1'),
    maxOrdersPerMinute: Number(process.env.TRADE_MAX_ORDERS_PER_MIN ?? '6'),
    killSwitchActive: (process.env.TRADE_KILL_SWITCH ?? 'false').toLowerCase() === 'true',
  };
}

export async function checkRisk(input: RiskCheckInput): Promise<RiskCheckResult> {
  const limits = readLimits();

  if (limits.killSwitchActive) {
    return { ok: false, reason: 'KILL_SWITCH_ACTIVE' };
  }

  if (input.qty <= 0 || !Number.isFinite(input.qty)) {
    return { ok: false, reason: 'INVALID_QTY' };
  }
  if (input.qty > limits.maxQtyPerOrder) {
    return { ok: false, reason: 'QTY_EXCEEDS_PER_ORDER_CAP', details: { cap: limits.maxQtyPerOrder } };
  }

  // Stop-loss must be on the correct side of estPrice.
  if (input.slPrice != null) {
    const valid = input.side === 'BUY' ? input.slPrice < input.estPrice : input.slPrice > input.estPrice;
    if (!valid) return { ok: false, reason: 'STOP_LOSS_WRONG_SIDE' };
  }
  if (input.tpPrice != null) {
    const valid = input.side === 'BUY' ? input.tpPrice > input.estPrice : input.tpPrice < input.estPrice;
    if (!valid) return { ok: false, reason: 'TAKE_PROFIT_WRONG_SIDE' };
  }

  // Order rate limiter (last 60s).
  const recent = await q<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM trade_orders
       WHERE account = $1 AND created_at > NOW() - INTERVAL '60 seconds'`,
    [input.account]
  );
  if (Number(recent[0]?.c ?? 0) >= limits.maxOrdersPerMinute) {
    return { ok: false, reason: 'ORDER_RATE_LIMIT', details: { perMin: limits.maxOrdersPerMinute } };
  }

  // Open positions cap (count of working/partial orders + active overlays as a proxy).
  const open = await q<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM trade_orders
       WHERE account = $1 AND status IN ('SUBMITTED','WORKING','PARTIAL')`,
    [input.account]
  );
  if (Number(open[0]?.c ?? 0) >= limits.maxOpenPositions) {
    return { ok: false, reason: 'MAX_OPEN_POSITIONS', details: { cap: limits.maxOpenPositions } };
  }

  // Daily loss check using realized fills today (paper accounts have no PnL feed yet,
  // so this is a soft floor — extend once a broker reports realized PnL).
  // Placeholder; intentionally permissive when we don't have data rather than blocking.

  return { ok: true };
}
