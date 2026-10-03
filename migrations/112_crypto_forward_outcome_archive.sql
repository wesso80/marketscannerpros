-- Forward-score rows (stamps plus 4h/24h outcome marks) kept past the Redis book's
-- 1000-row cap and 21-day TTL. Measurement only. Additive: does not alter, reference,
-- or read any trading, paper, or arca table.
-- Brad runs this before deploy. Calibration and the forward-book writer both tolerate
-- the table being absent: Redis behaviour is unchanged until the table exists.
CREATE TABLE IF NOT EXISTS crypto_forward_outcome_archive (
  row_key     TEXT PRIMARY KEY,
  symbol      TEXT NOT NULL,
  coin_id     TEXT NOT NULL,
  bucket      TEXT NOT NULL,
  signal_at   TIMESTAMPTZ NOT NULL,
  signal_day  DATE NOT NULL,
  payload     JSONB NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS crypto_forward_outcome_archive_coin_day_idx
  ON crypto_forward_outcome_archive (coin_id, signal_day DESC);
