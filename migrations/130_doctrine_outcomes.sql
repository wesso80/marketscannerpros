-- Personal playbook results read by lib/doctrine/stats.ts and written by
-- POST /api/doctrine/outcome. This file is not applied by the app.
-- Until it is applied, those callers check to_regclass and skip the table
-- instead of logging 42P01.
-- Do not run this from a deploy script in the same change that adds it.

CREATE TABLE IF NOT EXISTS doctrine_outcomes (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  doctrine_id TEXT NOT NULL,
  regime TEXT,
  asset_class TEXT,
  side TEXT,
  entry_price NUMERIC,
  exit_price NUMERIC,
  entry_date TIMESTAMPTZ,
  exit_date TIMESTAMPTZ,
  outcome TEXT,
  r_multiple NUMERIC,
  pnl_pct NUMERIC,
  confluence_at_entry NUMERIC,
  confidence_at_entry NUMERIC,
  dve_state TEXT,
  holding_days INTEGER,
  journal_trade_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS doctrine_outcomes_user_exit_idx
  ON doctrine_outcomes (user_id, exit_date DESC);
