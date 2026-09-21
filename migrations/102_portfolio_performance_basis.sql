-- Portfolio performance v2: distinguish legacy position-market-value snapshots
-- from full account-equity snapshots used for professional risk analytics.
ALTER TABLE portfolio_performance
  ADD COLUMN IF NOT EXISTS snapshot_basis TEXT;

CREATE INDEX IF NOT EXISTS idx_portfolio_performance_basis
  ON portfolio_performance (workspace_id, snapshot_basis, snapshot_date);
