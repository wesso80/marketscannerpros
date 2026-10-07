-- Paper-trade MFE/MAE and book give-back tracking (admin research only; simulated paper trades).
CREATE TABLE IF NOT EXISTS crypto_trade_excursions (
  position_id      TEXT PRIMARY KEY,
  workspace_id     TEXT NOT NULL,
  portfolio_id     TEXT NOT NULL,
  symbol           TEXT NOT NULL,
  instrument_type  TEXT NOT NULL,
  rule             TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('OPEN','CLOSED','UNAVAILABLE')),
  state            JSONB,
  mfe_r            DOUBLE PRECISION,
  mae_r            DOUBLE PRECISION,
  final_r          DOUBLE PRECISION,
  give_back        DOUBLE PRECISION,
  risk_usd         DOUBLE PRECISION,
  exit_at          TIMESTAMPTZ,
  reason           TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS crypto_trade_excursions_portfolio_idx ON crypto_trade_excursions (portfolio_id, status);
CREATE TABLE IF NOT EXISTS crypto_book_marks (
  portfolio_id      TEXT NOT NULL,
  workspace_id      TEXT NOT NULL,
  at                TIMESTAMPTZ NOT NULL,
  open_pnl          DOUBLE PRECISION NOT NULL,
  peak_open_profit  DOUBLE PRECISION,
  equity            DOUBLE PRECISION NOT NULL,
  positions         INTEGER NOT NULL,
  PRIMARY KEY (portfolio_id, at)
);
