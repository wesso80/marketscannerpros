-- History replay dataset (Phase 3): one row per historical 4h signal, taken or skipped (research only).
CREATE TABLE IF NOT EXISTS crypto_replay_signals (
  run_id          TEXT NOT NULL,
  signal_id       TEXT NOT NULL,
  coin            TEXT NOT NULL,
  product         TEXT NOT NULL,
  stage           TEXT NOT NULL,
  kind            TEXT,
  signal_at       TIMESTAMPTZ NOT NULL,
  entry_at        TIMESTAMPTZ,
  signal          JSONB NOT NULL,
  entry           JSONB,
  no_entry_reason TEXT,
  features        JSONB NOT NULL,
  liquidity       JSONB,
  outcomes        JSONB,
  decision        TEXT CHECK (decision IN ('TAKEN','SKIPPED')),
  book            TEXT,
  reasons         TEXT[] NOT NULL DEFAULT '{}',
  sizing          JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (run_id, signal_id)
);
CREATE INDEX IF NOT EXISTS crypto_replay_signals_entry_idx ON crypto_replay_signals (run_id, entry_at);
-- Completed 4h closes per coin segment, for point-in-time correlation in the portfolio simulation.
CREATE TABLE IF NOT EXISTS crypto_replay_bars (
  run_id    TEXT NOT NULL,
  coin      TEXT NOT NULL,
  seg_from  TIMESTAMPTZ NOT NULL,
  closes    JSONB NOT NULL,
  PRIMARY KEY (run_id, coin, seg_from)
);
