/**
 * Edge Profile unlock rule (TR-11). Pure and client-safe (no database import), so the
 * dashboard card and the stats engine share one threshold.
 */

/** Closed journal trades needed before the Edge Profile shows any statistics. */
export const EDGE_PROFILE_UNLOCK_TRADES = 10;

export interface EdgeProfileLock {
  locked: boolean;
  /** Closed trades counted so far (0 when unknown). */
  closedTrades: number;
  unlockAt: number;
  /** e.g. "3/10 closed trades". */
  progressLabel: string;
}

export function edgeProfileLock(totalOutcomes: number | null | undefined): EdgeProfileLock {
  const n = typeof totalOutcomes === 'number' && Number.isFinite(totalOutcomes) && totalOutcomes > 0 ? Math.floor(totalOutcomes) : 0;
  return {
    locked: n < EDGE_PROFILE_UNLOCK_TRADES,
    closedTrades: n,
    unlockAt: EDGE_PROFILE_UNLOCK_TRADES,
    progressLabel: `${Math.min(n, EDGE_PROFILE_UNLOCK_TRADES)}/${EDGE_PROFILE_UNLOCK_TRADES} closed trades`,
  };
}
