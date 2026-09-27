import { q, tx } from '../db';
import { calculateCapture, type CaptureCash, type CaptureClosed, type CapturePosition } from './captureValues';
import type { RiskEquitySnapshot } from '../admin/riskSnapshotMetrics';

let schema: Promise<void> | undefined;
export function ensureCaptureSchema(): Promise<void> {
  if (!schema) schema = (async () => {
    await q(`CREATE TABLE IF NOT EXISTS account_equity_capture (
      workspace_id TEXT PRIMARY KEY, enabled BOOLEAN NOT NULL DEFAULT TRUE,
      registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_attempt_at TIMESTAMPTZ,
      last_success_at TIMESTAMPTZ, last_error TEXT)`);
    await q(`CREATE TABLE IF NOT EXISTS account_equity_observations (
      workspace_id TEXT NOT NULL REFERENCES account_equity_capture(workspace_id),
      snapshot_date DATE NOT NULL, total_value NUMERIC NOT NULL, total_pl NUMERIC NOT NULL,
      captured_at TIMESTAMPTZ NOT NULL, inputs JSONB NOT NULL, PRIMARY KEY (workspace_id, snapshot_date))`);
    await q(`ALTER TABLE quotes_latest ADD COLUMN IF NOT EXISTS observed_at TIMESTAMPTZ`);
    await q(`ALTER TABLE quotes_latest ADD COLUMN IF NOT EXISTS observed_price NUMERIC`);
  })().catch(error => { schema = undefined; throw error; });
  return schema;
}

export interface CaptureStatus {
  enabled: boolean; last_attempt_at: string | null; last_success_at: string | null; last_error: string | null;
  observations: number; latest_date: string | null;
}
export async function readCaptureStatus(workspaceId: string): Promise<CaptureStatus | null> {
  try {
    const rows = await q<CaptureStatus>(`SELECT c.enabled, c.last_attempt_at::text, c.last_success_at::text, c.last_error,
      (SELECT COUNT(*)::int FROM account_equity_observations o WHERE o.workspace_id = c.workspace_id) AS observations,
      (SELECT MAX(snapshot_date)::text FROM account_equity_observations o WHERE o.workspace_id = c.workspace_id) AS latest_date
      FROM account_equity_capture c WHERE c.workspace_id = $1`, [workspaceId]);
    return rows[0] ?? null;
  } catch (error) {
    if ((error as { code?: string }).code === '42P01') return null;
    throw error;
  }
}

/** Registered accounts use only server observations; page visits cannot replace or mix these values. */
export async function readCapturedRiskHistory(workspaceId: string): Promise<RiskEquitySnapshot[] | null> {
  const status = await readCaptureStatus(workspaceId);
  if (!status?.enabled) return null;
  const rows = await q<RiskEquitySnapshot & { captured_at: string }>(`SELECT snapshot_date::text,
    total_value::text, total_pl::text, 'account_equity_v2' AS snapshot_basis, captured_at::text
    FROM account_equity_observations WHERE workspace_id = $1 ORDER BY snapshot_date DESC LIMIT 2`, [workspaceId]);
  const today = new Date().toISOString().slice(0, 10);
  // A failed or stalled worker cannot leave an apparently current account value behind.
  return rows.filter(row => row.snapshot_date !== today || (!status.last_error && Date.now() - Date.parse(row.captured_at) <= 30 * 60_000));
}

export async function enableAccountCapture(workspaceId: string) {
  await ensureCaptureSchema();
  await q(`INSERT INTO account_equity_capture (workspace_id) VALUES ($1)
    ON CONFLICT (workspace_id) DO UPDATE SET enabled = TRUE`, [workspaceId]);
  try { return await captureAccount(workspaceId, true); }
  catch (error) {
    await q(`UPDATE account_equity_capture SET last_attempt_at = NOW(), last_error = 'Account capture failed; saved inputs could not be read consistently.' WHERE workspace_id = $1`, [workspaceId]).catch(() => undefined);
    throw error;
  }
}

export async function captureAccount(workspaceId: string, force = false) {
  await ensureCaptureSchema();
  return tx(async client => {
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    // Same lock as Portfolio saves; no concurrent partial replacement can be captured.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [workspaceId]);
    const config = await client.query(`SELECT enabled, last_attempt_at, last_error FROM account_equity_capture WHERE workspace_id = $1 FOR UPDATE`, [workspaceId]);
    const row = config.rows[0];
    const now = new Date();
    if (!row?.enabled || (row.last_attempt_at && now.getTime() - new Date(row.last_attempt_at).getTime() < (force || row.last_error ? 60_000 : 15 * 60_000))) {
      return { status: 'skipped' as const };
    }
    const cash = await client.query<CaptureCash>(`SELECT entry_type, amount, effective_date::text FROM portfolio_cash_ledger WHERE workspace_id::text = $1`, [workspaceId]);
    const open = await client.query<CapturePosition>(`SELECT p.symbol, p.side, p.quantity, p.entry_price, p.journal_entry_id,
      j.id AS journal_row_id, j.is_open AS journal_is_open, j.status AS journal_status, j.trade_type, j.asset_class,
      u.asset_type AS quote_asset, quote.observed_price AS price, quote.observed_at::text
      FROM portfolio_positions p
      LEFT JOIN journal_entries j ON j.id = p.journal_entry_id AND j.workspace_id = p.workspace_id
      LEFT JOIN symbol_universe u ON u.symbol = p.symbol
      LEFT JOIN quotes_latest quote ON quote.symbol = p.symbol
      WHERE p.workspace_id = $1`, [workspaceId]);
    const closed = await client.query<CaptureClosed>(`SELECT c.id, c.journal_entry_id, c.realized_pl,
      j.id AS journal_row_id, j.is_open AS journal_is_open, j.status AS journal_status, j.pl AS journal_pl
      FROM portfolio_closed c LEFT JOIN journal_entries j ON j.id = c.journal_entry_id AND j.workspace_id = c.workspace_id
      WHERE c.workspace_id = $1`, [workspaceId]);
    const result = calculateCapture(cash.rows, open.rows, closed.rows, now);
    if (!result.ok) {
      const reason = result.issues.join(' ');
      await client.query(`UPDATE account_equity_capture SET last_attempt_at = $2, last_error = $3 WHERE workspace_id = $1`, [workspaceId, now, reason]);
      return { status: 'blocked' as const, reason };
    }
    await client.query(`INSERT INTO account_equity_observations (workspace_id, snapshot_date, total_value, total_pl, captured_at, inputs)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      ON CONFLICT (workspace_id, snapshot_date) DO UPDATE SET total_value = EXCLUDED.total_value,
        total_pl = EXCLUDED.total_pl, captured_at = EXCLUDED.captured_at, inputs = EXCLUDED.inputs`,
      [workspaceId, now.toISOString().slice(0, 10), result.equity, result.totalPL, now, JSON.stringify(result)]);
    await client.query(`UPDATE account_equity_capture SET last_attempt_at = $2, last_success_at = $2, last_error = NULL WHERE workspace_id = $1`, [workspaceId, now]);
    return { status: 'captured' as const, date: now.toISOString().slice(0, 10) };
  });
}

/** Called after ingestion. Bounded batch; account failures never stop market-data ingestion. */
export async function captureDueAccounts() {
  await ensureCaptureSchema();
  const due = await q<{ workspace_id: string }>(`SELECT workspace_id FROM account_equity_capture
    WHERE enabled AND (last_attempt_at IS NULL OR last_attempt_at < NOW() - INTERVAL '15 minutes'
      OR (last_error IS NOT NULL AND last_attempt_at < NOW() - INTERVAL '1 minute'))
    ORDER BY last_attempt_at ASC NULLS FIRST LIMIT 10`);
  const counts = { captured: 0, blocked: 0, skipped: 0, failed: 0 };
  for (const row of due) {
    try { counts[(await captureAccount(row.workspace_id)).status]++; }
    catch {
      counts.failed++;
      await q(`UPDATE account_equity_capture SET last_attempt_at = NOW(), last_error = 'Account capture failed; saved inputs could not be read consistently.' WHERE workspace_id = $1`, [row.workspace_id]).catch(() => undefined);
    }
  }
  return counts;
}

/** Only explicit enrolled accounts supply mark-refresh symbols; never guess an operator workspace. */
export async function dueCaptureSymbols() {
  await ensureCaptureSchema();
  return q<{ symbol: string; asset_type: string; observed_at: string | null; observed_price: string | null }>(`
    WITH due AS (
      SELECT workspace_id FROM account_equity_capture
      WHERE enabled AND (last_attempt_at IS NULL OR last_attempt_at < NOW() - INTERVAL '15 minutes'
        OR (last_error IS NOT NULL AND last_attempt_at < NOW() - INTERVAL '1 minute'))
      ORDER BY last_attempt_at ASC NULLS FIRST LIMIT 10
    )
    SELECT DISTINCT p.symbol, u.asset_type, quote.observed_at::text, quote.observed_price::text
    FROM due JOIN portfolio_positions p ON p.workspace_id = due.workspace_id
    JOIN symbol_universe u ON u.symbol = p.symbol
    LEFT JOIN quotes_latest quote ON quote.symbol = p.symbol
    WHERE u.asset_type IN ('equity', 'crypto') ORDER BY p.symbol LIMIT 100`);
}
