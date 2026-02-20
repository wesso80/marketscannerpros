CREATE TABLE IF NOT EXISTS portfolio_cash_ledger (
  id BIGSERIAL PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('starting_capital', 'deposit', 'withdrawal')),
  amount NUMERIC(20, 2) NOT NULL CHECK (amount >= 0),
  effective_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_cash_ledger_workspace_date
  ON portfolio_cash_ledger (workspace_id, effective_date DESC, created_at DESC);
