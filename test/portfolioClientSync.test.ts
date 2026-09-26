import { describe, expect, it } from 'vitest';
import {
  buildPortfolioSyncPayload,
  CASH_NOT_SAVED_MESSAGE,
  CONFLICT_MESSAGE,
  EMPTY_OVERWRITE_MESSAGE,
  gateAfterDelete,
  gateFromLoad,
  interpretSyncResponse,
  isEmptySyncPayload,
  LOAD_FAILED_MESSAGE,
  serverHasPortfolioData,
  shouldPostPortfolio,
  SYNC_FAILED_MESSAGE,
  SYNC_UNAVAILABLE_MESSAGE,
  type SyncGate,
} from '@/lib/portfolio/clientSync';

const enabled = (overrides: Partial<SyncGate> = {}): SyncGate => ({ enabled: true, revision: 'rev-1', lastSyncedJson: null, blockedMessage: null, ...overrides });

describe('Portfolio page sync gate', () => {
  it('a failed load (server error / network) never enables POSTs, so a device copy cannot overwrite the server', () => {
    expect(gateFromLoad({ ok: false })).toEqual({ enabled: false, revision: null, lastSyncedJson: null, blockedMessage: LOAD_FAILED_MESSAGE });
  });

  it('a load without a revision (old server) does not enable POSTs', () => {
    expect(gateFromLoad({ ok: true, data: { positions: [] } })).toMatchObject({ enabled: false, blockedMessage: SYNC_UNAVAILABLE_MESSAGE });
  });

  it('signed-out (localOnly) mode stays local without a warning', () => {
    expect(gateFromLoad({ ok: true, data: { localOnly: true } })).toMatchObject({ enabled: false, blockedMessage: null });
  });

  it('a successful load enables POSTs based on the server revision', () => {
    expect(gateFromLoad({ ok: true, data: { syncRevision: 'v1.abc.def' } })).toEqual({ enabled: true, revision: 'v1.abc.def', lastSyncedJson: null, blockedMessage: null });
  });

  it('does not POST on load when nothing changed, only after a change', () => {
    const payload = buildPortfolioSyncPayload([{ symbol: 'TEST' }], [], [], '10000', []);
    const json = JSON.stringify(payload);
    expect(shouldPostPortfolio(enabled({ lastSyncedJson: json }), json)).toBe(false);
    const changed = JSON.stringify(buildPortfolioSyncPayload([{ symbol: 'TEST' }, { symbol: 'NEW' }], [], [], '10000', []));
    expect(shouldPostPortfolio(enabled({ lastSyncedJson: json }), changed)).toBe(true);
    expect(shouldPostPortfolio({ ...enabled(), enabled: false }, changed)).toBe(false);
  });

  it('builds the same payload shape the server validates', () => {
    expect(buildPortfolioSyncPayload([], [], [], '', [])).toEqual({ positions: [], closedPositions: [], performanceHistory: [], cashState: { startingCapital: 0, cashLedger: [] } });
    expect(buildPortfolioSyncPayload([], [], [], '2500', []).cashState.startingCapital).toBe(2500);
  });

  it('empty payload ignores journal-linked rows (the server never writes them)', () => {
    expect(isEmptySyncPayload(buildPortfolioSyncPayload([{ journalEntryId: 3 }], [], [], '10000', []))).toBe(true);
    expect(isEmptySyncPayload(buildPortfolioSyncPayload([], [], [], '10000', [{ type: 'deposit', amount: 1 }]))).toBe(false);
  });

  it('recognises server data the page should use', () => {
    expect(serverHasPortfolioData({ positions: [], closedPositions: [], performanceHistory: [], cashState: null })).toBe(false);
    expect(serverHasPortfolioData({ positions: [{}] })).toBe(true);
    expect(serverHasPortfolioData({ cashState: { startingCapital: 1, cashLedger: [] } })).toBe(true);
  });
});

describe('interpreting POST responses', () => {
  it('saved: adopts the new revision', () => {
    expect(interpretSyncResponse(200, { success: true, syncRevision: 'r2', cashStateSaved: true })).toEqual({ kind: 'saved', revision: 'r2', message: null });
    expect(interpretSyncResponse(200, { success: true, syncRevision: 'r2', cashStateSaved: false })).toEqual({ kind: 'saved', revision: 'r2', message: CASH_NOT_SAVED_MESSAGE });
  });

  it('409 conflicts stop syncing with a clear message', () => {
    expect(interpretSyncResponse(409, { conflict: 'stale_revision' })).toEqual({ kind: 'blocked', message: CONFLICT_MESSAGE });
    expect(interpretSyncResponse(409, { conflict: 'empty_overwrite' })).toEqual({ kind: 'blocked', message: EMPTY_OVERWRITE_MESSAGE });
  });

  it('500 and malformed success are failures (retry on next change)', () => {
    expect(interpretSyncResponse(500, { error: 'Failed to save portfolio', stage: 'cash_ledger', code: '23503' })).toEqual({ kind: 'failed', message: SYNC_FAILED_MESSAGE });
    expect(interpretSyncResponse(200, { success: true })).toEqual({ kind: 'failed', message: SYNC_FAILED_MESSAGE });
  });

  it('localOnly success stops syncing silently', () => {
    expect(interpretSyncResponse(200, { success: true, localOnly: true })).toEqual({ kind: 'local_only' });
  });
});

describe('after a DELETE', () => {
  it('adopts the new revision when the server was at our revision before the delete', () => {
    expect(gateAfterDelete(enabled(), { previousRevision: 'rev-1', syncRevision: 'rev-2' })).toMatchObject({ enabled: true, revision: 'rev-2' });
  });

  it('stops syncing when something else changed the server first', () => {
    expect(gateAfterDelete(enabled(), { previousRevision: 'rev-9', syncRevision: 'rev-10' })).toMatchObject({ enabled: false, blockedMessage: CONFLICT_MESSAGE });
  });

  it('leaves the gate alone for responses without revisions or when sync is off', () => {
    expect(gateAfterDelete(enabled(), { success: true, deleted: 1 })).toEqual(enabled());
    const off = { ...enabled(), enabled: false };
    expect(gateAfterDelete(off, { previousRevision: 'rev-1', syncRevision: 'rev-2' })).toEqual(off);
  });
});
