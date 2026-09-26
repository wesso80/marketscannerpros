import { describe, expect, it, vi } from 'vitest';
import {
  isEmptyPortfolioPayload,
  readServerPortfolioState,
  replacePortfolio,
  type PortfolioSyncBody,
  type SqlClient,
  type SyncProgress,
} from '@/lib/portfolio/serverSync';

/**
 * Tiny in-memory stand-in for the four portfolio tables, understanding exactly the statements
 * lib/portfolio/serverSync.ts issues (incl. SAVEPOINT / ROLLBACK TO). Synthetic data only.
 */
type Row = Record<string, any> & { id: number };
type Tables = { positions: Row[]; closed: Row[]; performance: Row[]; cash: Row[] };

function pgError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

function fakeDb(opts: { cashInsertError?: string; cashTableMissing?: boolean; alterError?: string; positionInsertError?: string } = {}) {
  let seq = 100;
  const t: Tables = { positions: [], closed: [], performance: [], cash: [] };
  const savepoints = new Map<string, string>();
  const log: string[] = [];
  const clone = () => JSON.stringify(t);
  const restore = (json: string) => Object.assign(t, JSON.parse(json));
  const client: SqlClient = {
    async query(sql: string, params: any[] = []) {
      const s = sql.replace(/\s+/g, ' ').trim();
      log.push(s.slice(0, 60));
      const ws = params[0];
      let m: RegExpMatchArray | null;
      if ((m = s.match(/^SAVEPOINT (\w+)$/))) { savepoints.set(m[1], clone()); return { rows: [] }; }
      if ((m = s.match(/^RELEASE SAVEPOINT (\w+)$/))) { savepoints.delete(m[1]); return { rows: [] }; }
      if ((m = s.match(/^ROLLBACK TO SAVEPOINT (\w+)$/))) { restore(savepoints.get(m[1])!); return { rows: [] }; }
      if (s.startsWith('SELECT pg_advisory_xact_lock')) return { rows: [{}] };
      if (s.startsWith('SELECT md5') && s.includes('portfolio_positions')) {
        const keys = [
          ...t.positions.filter(r => r.workspace_id === ws && r.journal_entry_id == null).map(r => `p${r.id}`),
          ...t.closed.filter(r => r.workspace_id === ws && r.journal_entry_id == null).map(r => `c${r.id}`),
          ...t.performance.filter(r => r.workspace_id === ws).map(r => `f${r.id}`),
        ].sort();
        return { rows: [{ fp: keys.join(','), n: keys.length }] };
      }
      if (s.startsWith('SELECT md5') && s.includes('portfolio_cash_ledger')) {
        if (opts.cashTableMissing) throw pgError('42P01', 'relation "portfolio_cash_ledger" does not exist');
        const rows = t.cash.filter(r => r.workspace_id === ws);
        return { rows: [{ fp: rows.map(r => `${r.entry_type}:${r.id}`).join(','), flows: rows.filter(r => r.entry_type !== 'starting_capital').length }] };
      }
      if (s.startsWith('DELETE FROM portfolio_positions')) { t.positions = t.positions.filter(r => !(r.workspace_id === ws && r.journal_entry_id == null)); return { rows: [] }; }
      if (s.startsWith('DELETE FROM portfolio_closed')) { t.closed = t.closed.filter(r => !(r.workspace_id === ws && r.journal_entry_id == null)); return { rows: [] }; }
      if (s.startsWith('DELETE FROM portfolio_performance')) { t.performance = t.performance.filter(r => r.workspace_id !== ws); return { rows: [] }; }
      if (s.startsWith('DELETE FROM portfolio_cash_ledger')) {
        if (opts.cashTableMissing) throw pgError('42P01', 'relation "portfolio_cash_ledger" does not exist');
        t.cash = t.cash.filter(r => r.workspace_id !== ws); return { rows: [] };
      }
      if (s.startsWith('INSERT INTO portfolio_positions')) {
        if (opts.positionInsertError) throw pgError(opts.positionInsertError, 'insert failed');
        t.positions.push({ id: ++seq, workspace_id: ws, symbol: params[1], quantity: params[3] }); return { rows: [] };
      }
      if (s.startsWith('INSERT INTO portfolio_closed')) { t.closed.push({ id: ++seq, workspace_id: ws, symbol: params[1] }); return { rows: [] }; }
      if (s.startsWith('ALTER TABLE portfolio_performance')) { if (opts.alterError) throw pgError(opts.alterError, 'must be owner of table portfolio_performance'); return { rows: [] }; }
      if (s.startsWith('INSERT INTO portfolio_performance')) { t.performance.push({ id: ++seq, workspace_id: ws, snapshot_date: params[1] }); return { rows: [] }; }
      if (s.startsWith('INSERT INTO portfolio_cash_ledger')) {
        if (opts.cashInsertError) throw pgError(opts.cashInsertError, 'insert or update on table "portfolio_cash_ledger" violates foreign key constraint "portfolio_cash_ledger_workspace_id_fkey"');
        const entryType = s.includes("'starting_capital'") ? 'starting_capital' : params[1];
        t.cash.push({ id: ++seq, workspace_id: ws, entry_type: entryType }); return { rows: [] };
      }
      throw new Error(`fake db: unexpected SQL ${s}`);
    },
  };
  return { client, tables: t, log };
}

const WS = '3f2a9c1e-0b7d-4e21-9a55-1c2d3e4f5a6b';
const TS = '2026-09-25T17:00:00.000Z';

function body(overrides: Partial<PortfolioSyncBody> = {}): PortfolioSyncBody {
  return {
    positions: [
      { id: 1, symbol: 'TEST', side: 'LONG', quantity: 10, entryPrice: 50, currentPrice: 52.5, pl: 25, plPercent: 5, entryDate: TS },
      // journal-linked option row: owned by the journal, never written by the POST
      { id: 2, symbol: 'OPTX', side: 'LONG', quantity: 2, entryPrice: 1.25, currentPrice: 1.4, pl: 30, plPercent: 12, entryDate: TS, journalEntryId: 7, tradeType: 'Options' },
    ],
    closedPositions: [{ id: 3, symbol: 'DEMO', side: 'SHORT', quantity: 5, entryPrice: 20, currentPrice: 18, closePrice: 18, pl: 10, plPercent: 10, realizedPL: 10, entryDate: TS, closeDate: TS }],
    performanceHistory: [{ timestamp: TS, totalValue: 10035, totalPL: 35, basis: 'account_equity_v2' }],
    cashState: { startingCapital: 10000, cashLedger: [{ id: 'x', type: 'deposit', amount: 500, timestamp: TS }] },
    ...overrides,
  };
}

const emptyBody = (): PortfolioSyncBody => ({ positions: [], closedPositions: [], performanceHistory: [], cashState: { startingCapital: 10000, cashLedger: [] } });

async function revisionOf(client: SqlClient) {
  return (await readServerPortfolioState(client, WS)).revision;
}

describe('TR-1: POST /api/portfolio cash-ledger failure no longer fails the whole save', () => {
  it('FK violation on portfolio_cash_ledger (no workspaces row, 23503): positions/closed/snapshots saved, old cash rows kept', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const db = fakeDb({ cashInsertError: '23503' });
    db.tables.cash.push({ id: 1, workspace_id: WS, entry_type: 'starting_capital' }); // pre-existing cash row
    const result = await replacePortfolio(db.client, WS, body(), { baseRevision: await revisionOf(db.client) });
    expect(result.status).toBe('saved');
    expect(result.status === 'saved' && result.cashStateSaved).toBe(false);
    expect(db.tables.positions.map(r => r.symbol)).toEqual(['TEST']); // journal-linked OPTX skipped
    expect(db.tables.closed.map(r => r.symbol)).toEqual(['DEMO']);
    expect(db.tables.performance).toHaveLength(1);
    expect(db.tables.cash).toEqual([{ id: 1, workspace_id: WS, entry_type: 'starting_capital' }]); // rolled back to savepoint, not deleted
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('missing portfolio_cash_ledger table (42P01) is also best-effort', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const db = fakeDb({ cashTableMissing: true });
    const result = await replacePortfolio(db.client, WS, body(), { baseRevision: await revisionOf(db.client) });
    expect(result).toMatchObject({ status: 'saved', cashStateSaved: false });
    expect(db.tables.positions).toHaveLength(1);
    warn.mockRestore();
  });

  it('snapshot_basis ALTER without table ownership (42501) is best-effort', async () => {
    const db = fakeDb({ alterError: '42501' });
    const result = await replacePortfolio(db.client, WS, body(), { baseRevision: await revisionOf(db.client) });
    expect(result).toMatchObject({ status: 'saved', cashStateSaved: true });
    expect(db.tables.performance).toHaveLength(1);
  });

  it('saves everything, including the cash ledger, when all writes succeed', async () => {
    const db = fakeDb();
    const result = await replacePortfolio(db.client, WS, body(), { baseRevision: await revisionOf(db.client) });
    expect(result).toMatchObject({ status: 'saved', cashStateSaved: true });
    expect(db.tables.cash.map(r => r.entry_type)).toEqual(['starting_capital', 'deposit']);
  });

  it('a required write that fails still throws and reports the stage (for the 500 log line)', async () => {
    const db = fakeDb({ positionInsertError: '22001' });
    const progress: SyncProgress = { stage: 'start' };
    await expect(replacePortfolio(db.client, WS, body(), { baseRevision: await revisionOf(db.client) }, progress)).rejects.toMatchObject({ code: '22001' });
    expect(progress.stage).toBe('insert_positions');
  });
});

describe('data-loss guard: stale or empty copies never overwrite the server', () => {
  it('refuses a POST without a base revision (old cached page) and writes nothing', async () => {
    const db = fakeDb();
    const result = await replacePortfolio(db.client, WS, body(), {});
    expect(result).toMatchObject({ status: 'conflict', reason: 'revision_required' });
    expect(db.tables.positions).toHaveLength(0);
  });

  it('refuses a POST based on an older revision (another tab/device saved since) and writes nothing', async () => {
    const db = fakeDb();
    const staleRevision = await revisionOf(db.client);
    // another device saves first
    const other = await replacePortfolio(db.client, WS, body(), { baseRevision: staleRevision });
    expect(other.status).toBe('saved');
    const before = JSON.stringify(db.tables);
    const result = await replacePortfolio(db.client, WS, emptyBody(), { baseRevision: staleRevision, confirmClear: true });
    expect(result).toMatchObject({ status: 'conflict', reason: 'stale_revision' });
    expect(JSON.stringify(db.tables)).toBe(before);
  });

  it('the revision returned by a save is accepted for the next save', async () => {
    const db = fakeDb();
    const first = await replacePortfolio(db.client, WS, body(), { baseRevision: await revisionOf(db.client) });
    if (first.status !== 'saved') throw new Error('expected saved');
    expect(first.revision).toBe(await revisionOf(db.client));
    const second = await replacePortfolio(db.client, WS, body(), { baseRevision: first.revision });
    expect(second.status).toBe('saved');
    expect(second.revision).not.toBe(first.revision); // rows were rewritten, so the fingerprint moves on
  });

  it('refuses an empty portfolio over saved data, even with the right revision', async () => {
    const db = fakeDb();
    const saved = await replacePortfolio(db.client, WS, body(), { baseRevision: await revisionOf(db.client) });
    if (saved.status !== 'saved') throw new Error('expected saved');
    const before = JSON.stringify(db.tables);
    const result = await replacePortfolio(db.client, WS, emptyBody(), { baseRevision: saved.revision });
    expect(result).toMatchObject({ status: 'conflict', reason: 'empty_overwrite' });
    expect(JSON.stringify(db.tables)).toBe(before);
  });

  it('allows the explicit "clear all" action to empty it', async () => {
    const db = fakeDb();
    const saved = await replacePortfolio(db.client, WS, body(), { baseRevision: await revisionOf(db.client) });
    if (saved.status !== 'saved') throw new Error('expected saved');
    const result = await replacePortfolio(db.client, WS, emptyBody(), { baseRevision: saved.revision, confirmClear: true });
    expect(result.status).toBe('saved');
    expect(db.tables.positions).toHaveLength(0);
  });

  it('journal-linked rows do not count as data a POST could write', () => {
    const b = emptyBody();
    b.positions = [{ symbol: 'OPTX', journalEntryId: 9 }];
    expect(isEmptyPortfolioPayload(b)).toBe(true);
    expect(isEmptyPortfolioPayload(body())).toBe(false);
  });

  it('journal-linked server rows are not part of the revision (journal closes do not cause conflicts)', async () => {
    const db = fakeDb();
    const r1 = await revisionOf(db.client);
    db.tables.positions.push({ id: 5, workspace_id: WS, symbol: 'JRNL', journal_entry_id: 42 });
    expect(await revisionOf(db.client)).toBe(r1);
  });
});
