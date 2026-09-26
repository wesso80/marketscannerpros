/**
 * Stop / target levels for open portfolio positions, and the risk figures derived from them.
 *
 * Prices are in the position's own units (premium per share for options), so the figures here are
 * unit-free ratios. With no stop set, every stop-derived figure is null (shown as '—'); there is no
 * hidden default stop.
 */

export type Side = 'LONG' | 'SHORT';

export interface LevelPosition {
  side: Side;
  entryPrice: number;
  currentPrice: number;
  stopPrice?: number | null;
}

export interface OpenRiskMetrics {
  /** Open R multiple: move from entry divided by the entry-to-stop risk. Null without a stop on the loss side of entry. */
  rMultiple: number | null;
  /** Share of the entry-to-stop risk still left before the stop (0–100). Null without a stop on the loss side of entry. */
  riskRemainingPct: number | null;
  /** Distance from the current price to the stop, as % of the current price. Null without a stop. */
  stopDistancePct: number | null;
  /** True when a stop is set at or beyond entry (breakeven or locked-in profit), so there is no entry risk to measure R against. */
  stopAtOrPastEntry: boolean;
}

/** A usable price level, or null. */
export function validLevel(value: unknown): number | null {
  const n = typeof value === 'string' ? (value.trim() === '' ? NaN : Number(value)) : Number(value ?? NaN);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function openRiskMetrics(position: LevelPosition): OpenRiskMetrics {
  const stop = validLevel(position.stopPrice);
  const { side, entryPrice: entry, currentPrice: current } = position;
  if (stop == null || !(entry > 0)) {
    return { rMultiple: null, riskRemainingPct: null, stopDistancePct: null, stopAtOrPastEntry: false };
  }
  const stopDistancePct = current > 0 ? (Math.abs(current - stop) / current) * 100 : null;
  const riskPerUnit = side === 'LONG' ? entry - stop : stop - entry;
  if (!(riskPerUnit > 0)) {
    return { rMultiple: null, riskRemainingPct: null, stopDistancePct, stopAtOrPastEntry: true };
  }
  const move = side === 'LONG' ? current - entry : entry - current;
  const roomToStop = side === 'LONG' ? current - stop : stop - current;
  return {
    rMultiple: move / riskPerUnit,
    riskRemainingPct: Math.max(0, Math.min(100, (roomToStop / riskPerUnit) * 100)),
    stopDistancePct,
    stopAtOrPastEntry: false,
  };
}

export interface LevelValidation {
  stop: number | null;
  target: number | null;
  /** Blocking problems (bad numbers). */
  errors: string[];
  /** Non-blocking notes (e.g. stop already beyond the current price). */
  warnings: string[];
}

/** Validate stop/target text from the editor. Blank clears the level. */
export function validateLevels(
  input: { stop: string; target: string },
  position: { side: Side; entryPrice: number; currentPrice: number },
): LevelValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const stopText = input.stop.trim();
  const targetText = input.target.trim();
  const stop = stopText === '' ? null : validLevel(stopText);
  const target = targetText === '' ? null : validLevel(targetText);
  if (stopText !== '' && stop == null) errors.push('Stop must be a positive number (or blank for no stop).');
  if (targetText !== '' && target == null) errors.push('Target must be a positive number (or blank for no target).');
  const long = position.side === 'LONG';
  if (stop != null) {
    if (position.currentPrice > 0 && (long ? stop >= position.currentPrice : stop <= position.currentPrice)) {
      warnings.push(`Stop is ${long ? 'at or above' : 'at or below'} the current price, so it would already be hit.`);
    } else if (long ? stop >= position.entryPrice : stop <= position.entryPrice) {
      warnings.push('Stop is at or past entry (breakeven or locked-in profit), so R and Risk Remaining will show —.');
    }
  }
  if (target != null && (long ? target <= position.entryPrice : target >= position.entryPrice)) {
    warnings.push(`Target is ${long ? 'at or below' : 'at or above'} entry.`);
  }
  if (stop != null && target != null && (long ? target <= stop : target >= stop)) {
    errors.push(`Target must be ${long ? 'above' : 'below'} the stop for a ${position.side} position.`);
  }
  return { stop, target, errors, warnings };
}

export interface KeyedPosition {
  symbol: string;
  side: Side;
  entryPrice: number;
  quantity: number;
  journalEntryId?: number;
  stopPrice?: number | null;
  targetPrice?: number | null;
}

/**
 * Identity that survives a server round-trip (server ids are reassigned when positions are saved).
 * Prices/quantities are rounded to the server's 8 decimals; the entry timestamp is left out because its
 * format can change on the round-trip (duplicates are handled by requiring a unique match).
 */
export function positionContentKey(p: KeyedPosition): string {
  const r8 = (n: number) => Number(Number(n).toFixed(8));
  return [String(p.symbol).trim().toUpperCase(), p.side, r8(p.entryPrice), r8(p.quantity)].join('|');
}

/**
 * Stops/targets for manual positions are kept on this device (the server table has no columns for them).
 * Re-attach them to positions loaded from the server, matching by content key. Only an unambiguous match
 * (exactly one server position and one local position with that key) is copied; journal-linked positions
 * keep the levels from their journal entry.
 */
export function mergeLocalLevels<T extends KeyedPosition>(serverPositions: T[], localPositions: KeyedPosition[] | null | undefined): T[] {
  if (!Array.isArray(localPositions) || localPositions.length === 0) return serverPositions;
  const count = (list: KeyedPosition[]) => {
    const m = new Map<string, number>();
    for (const p of list) m.set(positionContentKey(p), (m.get(positionContentKey(p)) ?? 0) + 1);
    return m;
  };
  const serverCounts = count(serverPositions);
  const localCounts = count(localPositions);
  const localByKey = new Map(localPositions.map((p) => [positionContentKey(p), p]));
  return serverPositions.map((p) => {
    if (p.journalEntryId) return p;
    const key = positionContentKey(p);
    if (serverCounts.get(key) !== 1 || localCounts.get(key) !== 1) return p;
    const local = localByKey.get(key)!;
    const stopPrice = validLevel(local.stopPrice);
    const targetPrice = validLevel(local.targetPrice);
    if (stopPrice == null && targetPrice == null) return p;
    return { ...p, stopPrice, targetPrice };
  });
}
