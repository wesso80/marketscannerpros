-- Forward Test Tracker: auto-created paper positions from scanner signals
-- Run this migration after deploying the forward test feature

CREATE TABLE IF NOT EXISTS forward_tests (
  id              SERIAL PRIMARY KEY,
  signal_id       INTEGER NOT NULL UNIQUE REFERENCES signals_fired(id),
  symbol          TEXT NOT NULL,
  direction       TEXT NOT NULL CHECK (direction IN ('bullish', 'bearish')),
  entry_price     NUMERIC(20, 8) NOT NULL,
  target_price    NUMERIC(20, 8) NOT NULL,
  stop_price      NUMERIC(20, 8) NOT NULL,
  current_price   NUMERIC(20, 8),
  max_favorable_excursion NUMERIC(20, 8),
  max_adverse_excursion   NUMERIC(20, 8),
  pnl_percent     NUMERIC(10, 4),
  status          TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'TARGET_HIT', 'STOP_HIT', 'EXPIRED', 'CANCELLED')),
  bars_elapsed    INTEGER NOT NULL DEFAULT 0,
  max_bars        INTEGER NOT NULL DEFAULT 20,
  timeframe       TEXT NOT NULL DEFAULT 'daily',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_forward_tests_status ON forward_tests (status) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_forward_tests_symbol ON forward_tests (symbol, status);
CREATE INDEX IF NOT EXISTS idx_forward_tests_created ON forward_tests (created_at DESC);
