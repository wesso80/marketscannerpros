/**
 * Client-side rules for syncing the Portfolio page to /api/portfolio (pure helpers, no React).
 *
 * The server copy is authoritative. The page may only POST when:
 *  - the initial GET succeeded and returned a `syncRevision` (so we know what we are replacing), and
 *  - the local state actually differs from what was last loaded from / saved to the server.
 * A conflict (409) or a failed load stops syncing for the rest of the session; changes stay on this device.
 */

export type PortfolioSyncPayload = {
  positions: unknown[];
  closedPositions: unknown[];
  performanceHistory: unknown[];
  cashState: { startingCapital: number; cashLedger: unknown[] };
};

export function buildPortfolioSyncPayload(
  positions: unknown[],
  closedPositions: unknown[],
  performanceHistory: unknown[],
  startingCapitalInput: string,
  cashLedger: unknown[],
): PortfolioSyncPayload {
  return {
    positions,
    closedPositions,
    performanceHistory,
    cashState: { startingCapital: Number(startingCapitalInput || 0), cashLedger },
  };
}

/** Same rule as the server: nothing a POST would write (journal-linked rows are never written by POST). */
export function isEmptySyncPayload(payload: PortfolioSyncPayload): boolean {
  const manual = (rows: unknown[]) => rows.filter((row) => !(row as { journalEntryId?: unknown } | null)?.journalEntryId).length;
  return manual(payload.positions) === 0 && manual(payload.closedPositions) === 0
    && payload.performanceHistory.length === 0 && payload.cashState.cashLedger.length === 0;
}

export type SyncGate = {
  /** POSTs allowed this session. */
  enabled: boolean;
  /** Revision of the server copy our state is based on. */
  revision: string | null;
  /** JSON of the payload last loaded from / saved to the server; no POST while unchanged. */
  lastSyncedJson: string | null;
  /** Why syncing is off (shown to the user), when it is. */
  blockedMessage: string | null;
};

export const LOAD_FAILED_MESSAGE =
  "Couldn't load your saved portfolio from the server, so this page is showing the copy stored on this device. Changes are kept on this device only and won't be sent to the server until you reload.";
export const SYNC_UNAVAILABLE_MESSAGE =
  "Server sync is unavailable for this page, so changes are kept on this device only and won't be sent to the server until you reload.";
export const CONFLICT_MESSAGE =
  'Your saved portfolio changed since this page loaded (another tab or device). To avoid overwriting it, changes here are kept on this device only. Reload to get the latest.';
export const EMPTY_OVERWRITE_MESSAGE =
  'Not sending an empty portfolio over your saved one. Nothing on the server was changed. Reload to get the saved copy.';
export const SYNC_FAILED_MESSAGE = 'Portfolio sync failed — changes saved locally only';
export const CASH_NOT_SAVED_MESSAGE =
  'Positions synced, but cash deposits/withdrawals and starting capital could not be saved to the server. They are kept on this device.';

/** Decide the sync gate from the initial GET. */
export function gateFromLoad(result: { ok: boolean; data?: any }): SyncGate {
  if (!result.ok) return { enabled: false, revision: null, lastSyncedJson: null, blockedMessage: LOAD_FAILED_MESSAGE };
  const data = result.data ?? {};
  if (data.localOnly) return { enabled: false, revision: null, lastSyncedJson: null, blockedMessage: null };
  if (typeof data.syncRevision !== 'string' || !data.syncRevision) {
    return { enabled: false, revision: null, lastSyncedJson: null, blockedMessage: SYNC_UNAVAILABLE_MESSAGE };
  }
  return { enabled: true, revision: data.syncRevision, lastSyncedJson: null, blockedMessage: null };
}

/** True when the server response carried any portfolio data the page should use. */
export function serverHasPortfolioData(data: any): boolean {
  return Boolean(data?.positions?.length > 0 || data?.closedPositions?.length > 0 || data?.performanceHistory?.length > 0 || data?.cashState);
}

export function shouldPostPortfolio(gate: SyncGate, payloadJson: string): boolean {
  return gate.enabled && gate.revision != null && payloadJson !== gate.lastSyncedJson;
}

export type SyncOutcome =
  | { kind: 'saved'; revision: string; message: string | null }
  | { kind: 'blocked'; message: string }
  | { kind: 'failed'; message: string }
  | { kind: 'local_only' };

/** Interpret a POST /api/portfolio response. */
export function interpretSyncResponse(status: number, body: any): SyncOutcome {
  if (status >= 200 && status < 300) {
    if (body?.localOnly) return { kind: 'local_only' };
    if (typeof body?.syncRevision === 'string' && body.syncRevision) {
      return { kind: 'saved', revision: body.syncRevision, message: body.cashStateSaved === false ? CASH_NOT_SAVED_MESSAGE : null };
    }
    return { kind: 'failed', message: SYNC_FAILED_MESSAGE };
  }
  if (status === 409) {
    return { kind: 'blocked', message: body?.conflict === 'empty_overwrite' ? EMPTY_OVERWRITE_MESSAGE : CONFLICT_MESSAGE };
  }
  return { kind: 'failed', message: SYNC_FAILED_MESSAGE };
}

/**
 * After a DELETE: adopt the new revision only if the server was at our revision just before the delete
 * (i.e. nothing else changed it). Otherwise our copy is stale: stop syncing.
 */
export function gateAfterDelete(gate: SyncGate, body: any): SyncGate {
  if (!gate.enabled || typeof body?.syncRevision !== 'string' || typeof body?.previousRevision !== 'string') return gate;
  if (body.previousRevision === gate.revision) return { ...gate, revision: body.syncRevision };
  return { ...gate, enabled: false, blockedMessage: CONFLICT_MESSAGE };
}
