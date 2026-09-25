/**
 * Bar-level stop/target exit resolution for bracket-style backtest strategies.
 *
 * One shared rule set so every strategy fills stops and targets the same way:
 *
 *  1. Stop first. If a bar touches both the stop and the target, the stop wins.
 *     The intrabar path is unknown, so the worse outcome is assumed.
 *  2. Gap through the stop. If the bar OPENS beyond the stop, the stop order
 *     could not have filled at the stop price; it fills at the open (the worse
 *     of open and stop).
 *  3. Targets fill at the target level. A bar that opens beyond the target is
 *     still filled at the target, i.e. favourable gaps are NOT credited. This is
 *     deliberately conservative (a resting limit order could do better) and
 *     matches the scanner backtest (lib/backtest/scannerBacktest.ts).
 *
 * Longs and shorts are mirror images of each other.
 */

export type BarExitSide = 'LONG' | 'SHORT';

export interface BarExitInput {
  side: BarExitSide;
  open: number;
  high: number;
  low: number;
  /** Protective stop level. Omit/null for no stop. */
  stop?: number | null;
  /** Profit target level. Omit/null for no target. */
  target?: number | null;
}

export interface BarExitResult {
  exitPrice: number;
  exitReason: 'stop' | 'target';
  /** True when the stop was gapped through and filled at the open. */
  gapped: boolean;
}

const usable = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export function resolveBarExit({ side, open, high, low, stop, target }: BarExitInput): BarExitResult | null {
  if (usable(stop)) {
    if (side === 'LONG' && (low <= stop || open <= stop)) {
      const gapped = open < stop;
      return { exitPrice: gapped ? open : stop, exitReason: 'stop', gapped };
    }
    if (side === 'SHORT' && (high >= stop || open >= stop)) {
      const gapped = open > stop;
      return { exitPrice: gapped ? open : stop, exitReason: 'stop', gapped };
    }
  }

  if (usable(target)) {
    if (side === 'LONG' && (high >= target || open >= target)) {
      return { exitPrice: target, exitReason: 'target', gapped: false };
    }
    if (side === 'SHORT' && (low <= target || open <= target)) {
      return { exitPrice: target, exitReason: 'target', gapped: false };
    }
  }

  return null;
}
