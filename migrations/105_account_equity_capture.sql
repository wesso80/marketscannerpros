-- Server-owned observations are separate from browser-managed Portfolio history.
CREATE TABLE IF NOT EXISTS account_equity_capture (
  workspace_id TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error TEXT
);
CREATE TABLE IF NOT EXISTS account_equity_observations (
  workspace_id TEXT NOT NULL REFERENCES account_equity_capture(workspace_id),
  snapshot_date DATE NOT NULL,
  total_value NUMERIC NOT NULL,
  total_pl NUMERIC NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  inputs JSONB NOT NULL,
  PRIMARY KEY (workspace_id, snapshot_date)
);
ALTER TABLE quotes_latest ADD COLUMN IF NOT EXISTS observed_at TIMESTAMPTZ;
ALTER TABLE quotes_latest ADD COLUMN IF NOT EXISTS observed_price NUMERIC;
