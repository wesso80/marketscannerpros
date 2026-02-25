/**
 * Execution Engine — Position Sizing
 *
 * accountEquity × riskPct / (entry − stop) = quantity
 * Applies Kelly dampening, max-notional caps, and lot rounding.
 */

import type {
  TradeIntent,
  PositionSizingResult,
  AssetClass,
} from './types';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_RISK_PCT = 0.0075;          // 0.75 % per trade (matches BASE_RISK)
const DEFAULT_ACCOUNT_EQUITY = 100_000;   // fallback if no equity provided
const MAX_NOTIONAL_PCT = 0.25;            // single position ≤ 25% of equity
const MIN_QUANTITY = 0.0001;              // sub-penny coins allowed
const KELLY_DAMPER = 0.25;               // quarter-Kelly ceiling

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Round quantity to asset-appropriate lot size */
function roundLot(qty: number, assetClass: AssetClass): number {
  if (qty <= 0) return 0;

  switch (assetClass) {
    case 'crypto':
      // 4 decimal places for most coins
      return Math.floor(qty * 10_000) / 10_000;
    case 'equity':
    case 'options':
      // whole shares / contracts
      return Math.floor(qty);
    case 'futures':
      return Math.floor(qty);
    case 'forex':
      // micro-lots (1000 units)
      return Math.floor(qty / 1000) * 1000 || 1000;
    default:
      return Math.floor(qty);
  }
}

/** Optional quarter-Kelly ceiling.  Returns max size given winRate & payoff. */
export function kellyMaxSize(
  equity: number,
  riskPct: number,
  winRate: number,
  avgWin: number,
  avgLoss: number,
): number {
  if (avgLoss <= 0 || winRate <= 0 || winRate >= 1) return equity * riskPct;
  const payoff = avgWin / avgLoss;
  const kellyFraction = (winRate * payoff - (1 - winRate)) / payoff;
  const dampened = Math.max(0, kellyFraction) * KELLY_DAMPER;
  return equity * Math.min(dampened, riskPct);
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

export function computePositionSize(
  intent: TradeIntent,
  opts?: {
    governor_risk_per_trade?: number;
    governor_max_position_size?: number;
    effective_leverage?: number;
  },
): PositionSizingResult {
  const equity = intent.account_equity ?? DEFAULT_ACCOUNT_EQUITY;
  const riskPct = intent.risk_pct ?? opts?.governor_risk_per_trade ?? DEFAULT_RISK_PCT;
  const leverage = opts?.effective_leverage ?? intent.leverage ?? 1;
  const entry = intent.entry_price;

  // Compute stop if not provided: ATR-based default per asset class
  let stop = intent.stop_price;
  if (stop == null || stop <= 0) {
    const atrMult = intent.asset_class === 'crypto' ? 2.0 : 1.5;
    stop =
      intent.direction === 'LONG'
        ? entry - intent.atr * atrMult
        : entry + intent.atr * atrMult;
  }

  const stopDistance = Math.abs(entry - stop);
  if (stopDistance <= 0) {
    return zeroResult(equity, riskPct, entry, leverage);
  }

  // Dollar risk
  const dollarRisk = equity * riskPct;
  const riskPerUnit = stopDistance;

  // Raw quantity (before leverage)
  let rawQty = dollarRisk / riskPerUnit;

  // Apply governor cap
  if (opts?.governor_max_position_size && opts.governor_max_position_size > 0) {
    rawQty = Math.min(rawQty, opts.governor_max_position_size);
  }

  // With leverage the trader controls more units but same dollar risk
  // (leverage affects margin, not position-size formula — risk stays the same)
  // If leverage > 1, notional grows but quantity is unchanged — the broker
  // fronts the extra capital.  Position size formula stays equity×risk/stop.

  // Notional cap: single position ≤ MAX_NOTIONAL_PCT * equity * leverage
  const maxNotional = equity * MAX_NOTIONAL_PCT * leverage;
  const notionalRaw = rawQty * entry;
  if (notionalRaw > maxNotional && entry > 0) {
    rawQty = maxNotional / entry;
  }

  // Round to lot
  const quantity = Math.max(
    roundLot(rawQty, intent.asset_class),
    intent.asset_class === 'crypto' ? MIN_QUANTITY : 1,
  );

  const notional = quantity * entry * leverage;
  const totalRisk = quantity * riskPerUnit;

  return {
    quantity,
    raw_quantity: rawQty,
    risk_per_unit: riskPerUnit,
    total_risk_usd: totalRisk,
    account_equity: equity,
    risk_pct: riskPct,
    notional_usd: notional,
    leverage,
  };
}

/* ------------------------------------------------------------------ */
/*  Zero fallback                                                      */
/* ------------------------------------------------------------------ */

function zeroResult(
  equity: number,
  riskPct: number,
  entry: number,
  leverage: number,
): PositionSizingResult {
  return {
    quantity: 0,
    raw_quantity: 0,
    risk_per_unit: 0,
    total_risk_usd: 0,
    account_equity: equity,
    risk_pct: riskPct,
    notional_usd: 0,
    leverage,
  };
}
