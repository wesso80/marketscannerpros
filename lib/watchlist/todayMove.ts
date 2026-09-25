/**
 * Watchlist rows show exactly what the quote says: today's % move. No invented
 * "confidence", stage, alignment or confluence scores are derived from it.
 * Up and down moves are treated the same way (sorting uses the size of the move),
 * and a symbol without a price is never hidden unless the user asks for it.
 */

export type MoveDirection = 'up' | 'down' | 'flat' | 'unpriced';
export type MoveFilter = 'all' | MoveDirection;
export type MoveSort = 'saved' | 'move' | 'symbol';

export interface TodayMove {
  /** Today's % change, or null when there is no quote / no change figure. */
  changePercent: number | null;
  direction: MoveDirection;
}

export function todayMove(changePercent: number | null | undefined): TodayMove {
  if (changePercent == null || !Number.isFinite(changePercent)) {
    return { changePercent: null, direction: 'unpriced' };
  }
  const rounded = Math.round(changePercent * 100) / 100;
  return {
    changePercent,
    direction: rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat',
  };
}

/** "+1.23%", "-0.40%", "0.00%", or "No price". */
export function formatTodayMove(move: TodayMove): string {
  if (move.changePercent == null) return 'No price';
  const v = move.changePercent;
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

export function filterByMove<T extends TodayMove>(rows: T[], filter: MoveFilter): T[] {
  if (filter === 'all') return rows;
  return rows.filter((row) => row.direction === filter);
}

/**
 * 'saved' keeps the list's saved order; 'move' puts the largest moves first
 * regardless of direction (a -3% day ranks the same as a +3% day), unpriced last;
 * 'symbol' is alphabetical.
 */
export function sortByMove<T extends TodayMove & { item: { symbol: string } }>(rows: T[], sort: MoveSort): T[] {
  const out = [...rows];
  if (sort === 'move') {
    out.sort((a, b) => {
      if (a.changePercent == null && b.changePercent == null) return 0;
      if (a.changePercent == null) return 1;
      if (b.changePercent == null) return -1;
      return Math.abs(b.changePercent) - Math.abs(a.changePercent);
    });
  } else if (sort === 'symbol') {
    out.sort((a, b) => a.item.symbol.localeCompare(b.item.symbol));
  }
  return out;
}

export interface MoveSummary {
  total: number;
  priced: number;
  up: number;
  down: number;
  flat: number;
  unpriced: number;
  /** Average move of priced symbols only; null when nothing is priced. */
  avgChangePercent: number | null;
}

export function summarizeMoves(rows: TodayMove[]): MoveSummary {
  const priced = rows.filter((r) => r.changePercent != null);
  const sum = priced.reduce((acc, r) => acc + (r.changePercent as number), 0);
  return {
    total: rows.length,
    priced: priced.length,
    up: rows.filter((r) => r.direction === 'up').length,
    down: rows.filter((r) => r.direction === 'down').length,
    flat: rows.filter((r) => r.direction === 'flat').length,
    unpriced: rows.filter((r) => r.direction === 'unpriced').length,
    avgChangePercent: priced.length > 0 ? sum / priced.length : null,
  };
}
