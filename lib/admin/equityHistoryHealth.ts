import { q } from '@/lib/db';

/** Read-only diagnosis. Cash values are never substituted for missing equity observations. */
export async function equityHistoryNotes(workspaceId: string): Promise<string[]> {
  const [history, cash] = await Promise.allSettled([
    q<{ clean: number; legacy: number; latest_clean: string | null }>(`
      SELECT COUNT(*) FILTER (WHERE snapshot_basis = 'account_equity_v2')::int AS clean,
        COUNT(*) FILTER (WHERE snapshot_basis IS DISTINCT FROM 'account_equity_v2')::int AS legacy,
        MAX(snapshot_date) FILTER (WHERE snapshot_basis = 'account_equity_v2')::text AS latest_clean
      FROM portfolio_performance WHERE workspace_id = $1`, [workspaceId]),
    q<{ starting_rows: number }>(`
      SELECT COUNT(*) FILTER (WHERE entry_type = 'starting_capital')::int AS starting_rows
      FROM portfolio_cash_ledger WHERE workspace_id::text = $1`, [workspaceId]),
  ]);
  const row = history.status === 'fulfilled' ? history.value[0] : null;
  const count = cash.status === 'fulfilled' ? cash.value[0]?.starting_rows : null;
  return [
    row ? `Equity history: ${row.clean} account-equity observations, ${row.legacy} legacy position-value observations. Latest account-equity date: ${row.latest_clean ?? 'none'}.` : 'Equity history could not be read.',
    count == null ? 'Persisted cash ledger could not be read; starting capital is unverified.'
      : count === 1 ? 'A starting-capital entry exists in the persisted cash ledger.'
      : count === 0 ? 'No starting-capital entry exists in the persisted cash ledger. Reconcile starting capital and cash flows before enabling unattended account-equity capture.'
      : 'Multiple starting-capital entries exist; reconcile the cash ledger before enabling unattended account-equity capture.',
    'Account snapshots currently originate from Portfolio page visits; no background daily capture is configured. Missing dates cannot be reconstructed from current balances.',
  ];
}
