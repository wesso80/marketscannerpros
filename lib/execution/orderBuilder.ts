/**
 * Execution Engine — Order Builder
 *
 * Assembles the final OrderInstruction from a validated proposal.
 */

import { randomUUID } from 'crypto';
import type {
  TradeIntent,
  PositionSizingResult,
  ExitPlan,
  LeverageResult,
  OptionsSelection,
  OrderInstruction,
  OrderType,
  TimeInForce,
} from './types';

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

export function buildOrder(input: {
  intent: TradeIntent;
  sizing: PositionSizingResult;
  exits: ExitPlan;
  leverage: LeverageResult;
  options?: OptionsSelection;
  proposal_id: string;
}): OrderInstruction {
  const { intent, sizing, exits, leverage, options, proposal_id } = input;

  const side: 'BUY' | 'SELL' = intent.direction === 'LONG' ? 'BUY' : 'SELL';

  // Order type defaults
  let orderType: OrderType = 'LIMIT';
  let tif: TimeInForce = 'DAY';

  // Crypto → IOC market-like limit
  if (intent.asset_class === 'crypto') {
    tif = 'GTC';
  }

  // Event strategy → market for speed
  if (intent.strategy_tag === 'EVENT_STRATEGY') {
    orderType = 'MARKET';
    tif = 'IOC';
  }

  const order: OrderInstruction = {
    symbol: intent.symbol,
    side,
    order_type: orderType,
    time_in_force: tif,
    quantity: sizing.quantity,
    limit_price: orderType === 'LIMIT' ? intent.entry_price : undefined,
    stop_price: undefined,
    bracket_stop: exits.stop_price,
    bracket_tp1: exits.take_profit_1,
    bracket_tp2: exits.take_profit_2,
    leverage: leverage.recommended_leverage > 1 ? leverage.recommended_leverage : undefined,
    asset_class: intent.asset_class,
    client_order_id: randomUUID(),
    proposal_id,
  };

  // Options augmentation
  if (options && options.structure !== 'NONE') {
    order.option_type =
      options.structure.includes('CALL') || options.structure === 'STRADDLE'
        ? 'CALL'
        : 'PUT';
    order.strike = options.strike;
    if (options.dte > 0) {
      const exp = new Date();
      exp.setDate(exp.getDate() + options.dte);
      order.expiration = exp.toISOString().slice(0, 10);
    }
  }

  return order;
}
