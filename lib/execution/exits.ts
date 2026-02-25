/**
 * Execution Engine — Exit Plan Builder
 *
 * Computes stop, TP1, TP2, trailing stop rule, and time stops
 * based on asset class, regime, ATR, and strategy tag.
 */

import type { Regime, StrategyTag, Direction } from '@/lib/risk-governor-hard';
import type { ExitPlan, TrailRule, AssetClass } from './types';

/* ------------------------------------------------------------------ */
/*  ATR Multipliers by Asset Class                                     */
/* ------------------------------------------------------------------ */

const STOP_ATR_MULT: Record<string, number> = {
  equity: 1.5,
  crypto: 2.0,
  futures: 1.5,
  forex: 1.0,
  options: 1.5,
};

const TP1_RR: Record<string, number> = {
  equity: 2.0,
  crypto: 2.5,
  futures: 2.0,
  forex: 1.5,
  options: 2.0,
};

const TP2_RR: Record<string, number> = {
  equity: 4.0,
  crypto: 5.0,
  futures: 3.5,
  forex: 3.0,
  options: 3.0,
};

/* ------------------------------------------------------------------ */
/*  Regime adjustments                                                 */
/* ------------------------------------------------------------------ */

function regimeStopMultiplier(regime: Regime): number {
  switch (regime) {
    case 'VOL_EXPANSION':
    case 'RISK_OFF_STRESS':
      return 1.3;         // wider stop in high-vol
    case 'VOL_CONTRACTION':
      return 0.8;         // tighter stop in quiet market
    default:
      return 1.0;
  }
}

function regimeTP1Multiplier(regime: Regime): number {
  switch (regime) {
    case 'TREND_UP':
    case 'TREND_DOWN':
      return 1.2;         // let runners run
    case 'RANGE_NEUTRAL':
      return 0.85;        // take profit faster in range
    default:
      return 1.0;
  }
}

/* ------------------------------------------------------------------ */
/*  Strategy adjustments                                               */
/* ------------------------------------------------------------------ */

function strategyStopTweak(tag: StrategyTag): number {
  switch (tag) {
    case 'MEAN_REVERSION':
      return 0.75;        // tighter stop — reversion is precise
    case 'BREAKOUT_CONTINUATION':
      return 1.15;        // slightly wider — breakout needs room
    case 'EVENT_STRATEGY':
      return 1.4;         // events = wide bars
    default:
      return 1.0;
  }
}

/* ------------------------------------------------------------------ */
/*  Trail rule selection                                               */
/* ------------------------------------------------------------------ */

function pickTrailRule(
  regime: Regime,
  assetClass: AssetClass,
  strategy: StrategyTag,
): TrailRule {
  if (regime === 'TREND_UP' || regime === 'TREND_DOWN') {
    return 'CHANDELIER';
  }
  if (regime === 'VOL_EXPANSION' || regime === 'RISK_OFF_STRESS') {
    return 'ATR_2X';
  }
  if (strategy === 'BREAKOUT_CONTINUATION') {
    return 'ATR_1_5X';
  }
  if (strategy === 'MEAN_REVERSION' || strategy === 'RANGE_FADE') {
    return 'BREAKEVEN_AFTER_1R';
  }
  return 'ATR_1X';
}

/* ------------------------------------------------------------------ */
/*  Time stop (minutes)                                                */
/* ------------------------------------------------------------------ */

function timeStopMinutes(assetClass: AssetClass, strategy: StrategyTag): number {
  if (strategy === 'EVENT_STRATEGY') return 60;          // 1 hour max
  if (assetClass === 'crypto') return 60 * 24;           // 24h for crypto
  if (assetClass === 'forex') return 60 * 8;             // 8h session
  if (strategy === 'MEAN_REVERSION') return 60 * 4;     // 4h reversion window
  return 60 * 6.5;                                       // US market session
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

export function buildExitPlan(input: {
  direction: Direction;
  entry_price: number;
  atr: number;
  asset_class: AssetClass;
  regime: Regime;
  strategy_tag: StrategyTag;
  /** Caller can override stop */
  stop_override?: number;
  /** Caller can override TP1 */
  tp1_override?: number;
  /** Caller can override TP2 */
  tp2_override?: number;
}): ExitPlan {
  const {
    direction,
    entry_price,
    atr,
    asset_class,
    regime,
    strategy_tag,
    stop_override,
    tp1_override,
    tp2_override,
  } = input;

  const ac = asset_class as string;

  // Stop distance = ATR × base mult × regime × strategy
  const baseStopMult = STOP_ATR_MULT[ac] ?? 1.5;
  const stopDist =
    atr * baseStopMult * regimeStopMultiplier(regime) * strategyStopTweak(strategy_tag);

  const stopPrice =
    stop_override ??
    (direction === 'LONG' ? entry_price - stopDist : entry_price + stopDist);

  const actualStopDist = Math.abs(entry_price - stopPrice);

  // TP1 / TP2
  const tp1RR = (TP1_RR[ac] ?? 2.0) * regimeTP1Multiplier(regime);
  const tp2RR = TP2_RR[ac] ?? 4.0;

  const tp1 =
    tp1_override ??
    (direction === 'LONG'
      ? entry_price + actualStopDist * tp1RR
      : entry_price - actualStopDist * tp1RR);

  const tp2 =
    tp2_override ??
    (direction === 'LONG'
      ? entry_price + actualStopDist * tp2RR
      : entry_price - actualStopDist * tp2RR);

  const trail = pickTrailRule(regime, asset_class, strategy_tag);
  const timeStop = timeStopMinutes(asset_class, strategy_tag);

  return {
    stop_price: round(stopPrice),
    take_profit_1: round(tp1),
    take_profit_2: round(tp2),
    trail_rule: trail,
    time_stop_minutes: timeStop,
    rr_at_tp1: round(tp1RR, 2),
    rr_at_tp2: round(tp2RR, 2),
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function round(v: number, d = 6): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}
