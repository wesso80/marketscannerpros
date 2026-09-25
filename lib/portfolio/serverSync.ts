/**
 * Server side of the Portfolio sync (POST /api/portfolio wipe-and-replace).
 *
 * Two jobs:
 * 1. Never let a stale or empty client copy overwrite newer server data.
 *    - Every GET returns a `syncRevision` (a fingerprint of the rows a POST replaces).
 *    - A POST must send the revision it was based on (`baseRevision`). If the server copy has
 *      changed since (another tab/device, or a copy loaded from this device's storage), the POST
 *      is refused with a conflict and nothing is written.
 *    - A POST with nothing in it (no manual positions, closed trades, snapshots or cash flows) is
 *      refused while the server still holds data, unless it is the explicit "clear all" action.
 * 2. Keep optional parts best-effort, as they were before 21 Sep 2026: the cash-ledger write and
 *    the snapshot_basis ALTER run inside savepoints, so if they fail (e.g. the cash ledger's
 *    workspace foreign key has no workspaces row, or the table is missing) positions and
 *    snapshots are still saved and the old cash-ledger rows are left untouched.
 */

export type SqlClient = { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> };

export type PortfolioSyncBody = {
  positions: any[];
  closedPositions: any[];
  performanceHistory: any[];
  cashState: { startingCapital: number; cashLedger: any[] };
};

export type ServerPortfolioState = {
  /** Fingerprint of the manual rows, snapshots and cash ledger. Changes on every write. */
  revision: string;
  /** True when the server holds manual positions, closed trades, snapshots or cash flows. */
  hasData: boolean;
};

export type ReplaceResult =
  | { status: 'saved'; revision: string; cashStateSaved: boolean }
  | { status: 'conflict'; reason: 'revision_required' | 'stale_revision' | 'empty_overwrite'; revision: string };

/** Mutable progress marker so the route can log which step failed. */
export type SyncProgress = { stage: string };

let savepointSeq = 0;

/** Run `work` inside a savepoint; on failure roll back just that part and report the error. */
export async function bestEffort<T>(
  client: SqlClient,
  work: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  const name = `msp_portfolio_sp_${++savepointSeq}`;
  await client.query(`SAVEPOINT ${name}`);
  try {
    const value = await work();
    await client.query(`RELEASE SAVEPOINT ${name}`);
    return { ok: true, value };
  } catch (error) {
    await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
    return { ok: false, error };
  }
}

export function sqlErrorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

/** Must run inside a transaction (uses a savepoint for the optional cash-ledger read). */
export async function readServerPortfolioState(client: SqlClient, workspaceId: string): Promise<ServerPortfolioState> {
  const main = (await client.query(
    `SELECT md5(coalesce(string_agg(k, ',' ORDER BY k), '')) AS fp, count(*)::int AS n FROM (
       SELECT 'p' || id AS k FROM portfolio_positions WHERE workspace_id = $1 AND journal_entry_id IS NULL
       UNION ALL SELECT 'c' || id FROM portfolio_closed WHERE workspace_id = $1 AND journal_entry_id IS NULL
       UNION ALL SELECT 'f' || id FROM portfolio_performance WHERE workspace_id = $1
     ) t`,
    [workspaceId],
  )).rows[0] ?? {};
  const cash = await bestEffort(client, async () => (await client.query(
    `SELECT md5(coalesce(string_agg(entry_type || ':' || id, ',' ORDER BY id), '')) AS fp,
            (count(*) FILTER (WHERE entry_type IN ('deposit', 'withdrawal')))::int AS flows
     FROM portfolio_cash_ledger WHERE workspace_id = $1`,
    [workspaceId],
  )).rows[0] ?? {});
  const cashFp = cash.ok ? String(cash.value.fp ?? '') : 'unavailable';
  const flows = cash.ok ? Number(cash.value.flows ?? 0) : 0;
  return {
    revision: `v1.${String(main.fp ?? '')}.${cashFp}`,
    hasData: Number(main.n ?? 0) > 0 || flows > 0,
  };
}

/** Nothing a POST would write: no manual positions/closed trades (journal-linked rows are never written), no snapshots, no cash flows. */
export function isEmptyPortfolioPayload(body: PortfolioSyncBody): boolean {
  const manual = (rows: any[]) => rows.filter((row) => !row?.journalEntryId).length;
  return manual(body.positions) === 0 && manual(body.closedPositions) === 0
    && body.performanceHistory.length === 0 && body.cashState.cashLedger.length === 0;
}

/**
 * Replace the workspace's manual portfolio rows with `body`. Must run inside a transaction.
 * Returns a conflict (and writes nothing) when the client copy is stale or would wipe data.
 */
export async function replacePortfolio(
  client: SqlClient,
  workspaceId: string,
  body: PortfolioSyncBody,
  opts: { baseRevision?: unknown; confirmClear?: unknown },
  progress: SyncProgress = { stage: 'start' },
): Promise<ReplaceResult> {
  const q = async (sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows;

  progress.stage = 'lock';
  // Serialize replacements for this workspace; an insert failure rolls back all deletes.
  await q('SELECT pg_advisory_xact_lock(hashtext($1))', [workspaceId]);

  progress.stage = 'read_revision';
  const current = await readServerPortfolioState(client, workspaceId);
  if (typeof opts.baseRevision !== 'string' || !opts.baseRevision) {
    return { status: 'conflict', reason: 'revision_required', revision: current.revision };
  }
  if (opts.baseRevision !== current.revision) {
    return { status: 'conflict', reason: 'stale_revision', revision: current.revision };
  }
  if (isEmptyPortfolioPayload(body) && current.hasData && opts.confirmClear !== true) {
    return { status: 'conflict', reason: 'empty_overwrite', revision: current.revision };
  }

  progress.stage = 'delete_manual_rows';
  await q(`DELETE FROM portfolio_positions WHERE workspace_id = $1 AND (journal_entry_id IS NULL)`, [workspaceId]);
  await q(`DELETE FROM portfolio_closed WHERE workspace_id = $1 AND (journal_entry_id IS NULL)`, [workspaceId]);
  await q(`DELETE FROM portfolio_performance WHERE workspace_id = $1`, [workspaceId]);

  progress.stage = 'insert_positions';
  for (const p of body.positions) {
    if (p.journalEntryId) continue; // journal-linked rows are owned by the journal and preserved
    await q(
      `INSERT INTO portfolio_positions (workspace_id, symbol, side, quantity, entry_price, current_price, entry_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [workspaceId, p.symbol, p.side, p.quantity, p.entryPrice, p.currentPrice, p.entryDate || new Date().toISOString()],
    );
  }

  progress.stage = 'insert_closed';
  for (const p of body.closedPositions) {
    if (p.journalEntryId) continue;
    await q(
      `INSERT INTO portfolio_closed (workspace_id, symbol, side, quantity, entry_price, close_price, entry_date, close_date, realized_pl)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [workspaceId, p.symbol, p.side, p.quantity, p.entryPrice, p.closePrice ?? p.currentPrice, p.entryDate, p.closeDate, p.realizedPL ?? p.pl],
    );
  }

  // The column is created by migration 102 and by every GET; keep this best-effort (it needs table ownership).
  progress.stage = 'ensure_snapshot_basis';
  await bestEffort(client, () => q(`ALTER TABLE portfolio_performance ADD COLUMN IF NOT EXISTS snapshot_basis TEXT`));

  // Only rows explicitly produced by the account-equity model are eligible for risk analytics.
  progress.stage = 'insert_snapshots';
  for (const p of body.performanceHistory) {
    const date = new Date(p.timestamp).toISOString().split('T')[0];
    const basis = p.basis === 'account_equity_v2' ? 'account_equity_v2' : 'legacy_position_value';
    await q(
      `INSERT INTO portfolio_performance (workspace_id, snapshot_date, total_value, total_pl, snapshot_basis)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (workspace_id, snapshot_date) DO UPDATE
       SET total_value = $3, total_pl = $4, snapshot_basis = $5`,
      [workspaceId, date, p.totalValue, p.totalPL, basis],
    );
  }

  progress.stage = 'cash_ledger';
  const cash = await bestEffort(client, async () => {
    await q(`DELETE FROM portfolio_cash_ledger WHERE workspace_id = $1`, [workspaceId]);
    const startingCapital = Number(body.cashState?.startingCapital);
    await q(
      `INSERT INTO portfolio_cash_ledger (workspace_id, entry_type, amount, effective_date, note)
       VALUES ($1, 'starting_capital', $2, $3, $4)`,
      [workspaceId, Number.isFinite(startingCapital) ? startingCapital : 10000, new Date().toISOString(), 'Configured starting capital'],
    );
    for (const item of body.cashState?.cashLedger || []) {
      const entryType = item?.type === 'withdrawal' ? 'withdrawal' : 'deposit';
      const amount = Number(item?.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      await q(
        `INSERT INTO portfolio_cash_ledger (workspace_id, entry_type, amount, effective_date, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [workspaceId, entryType, amount, item?.timestamp || new Date().toISOString(), item?.note || null],
      );
    }
  });
  if (!cash.ok) {
    console.warn('Portfolio POST: cash ledger not saved (positions and snapshots were saved); code:', sqlErrorCode(cash.error) ?? 'unknown',
      cash.error instanceof Error ? cash.error.message : cash.error);
  }

  progress.stage = 'read_new_revision';
  const next = await readServerPortfolioState(client, workspaceId);
  progress.stage = 'done';
  return { status: 'saved', revision: next.revision, cashStateSaved: cash.ok };
}
