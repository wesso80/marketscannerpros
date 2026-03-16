-- MSP v3: ARCA Doctrine Engine — Outcome Tracking
-- Run this migration against your Neon database.

CREATE TABLE IF NOT EXISTS doctrine_outcomes (
  id              BIGSERIAL PRIMARY KEY,
  user_id         TEXT NOT NULL,
  symbol          TEXT NOT NULL,
  doctrine_id     TEXT NOT NULL,
  regime          TEXT NOT NULL,
  asset_class     TEXT NOT NULL DEFAULT 'equity',
  side            TEXT NOT NULL DEFAULT 'long',
  entry_price     NUMERIC(18,6) NOT NULL,
  exit_price      NUMERIC(18,6) NOT NULL,
  entry_date      TIMESTAMPTZ NOT NULL,
  exit_date       TIMESTAMPTZ NOT NULL,
  outcome         TEXT NOT NULL CHECK (outcome IN ('win', 'loss', 'breakeven')),
  r_multiple      NUMERIC(8,3),
  pnl_pct         NUMERIC(8,3),
  confluence_at_entry  INTEGER,
  confidence_at_entry  INTEGER,
  dve_state       TEXT,
  holding_days    INTEGER,
  journal_trade_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_doctrine_outcomes_user ON doctrine_outcomes(user_id);
CREATE INDEX IF NOT EXISTS idx_doctrine_outcomes_doctrine ON doctrine_outcomes(doctrine_id);
CREATE INDEX IF NOT EXISTS idx_doctrine_outcomes_user_doctrine ON doctrine_outcomes(user_id, doctrine_id);
CREATE INDEX IF NOT EXISTS idx_doctrine_outcomes_regime ON doctrine_outcomes(user_id, regime);
