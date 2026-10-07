-- Shadow meta-labelling model (Phase 4): trained models, the locked holdout and live log-only scores (research only).
CREATE TABLE IF NOT EXISTS crypto_meta_models (
  model_id    TEXT PRIMARY KEY,
  trained_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  run_id      TEXT NOT NULL,
  version     TEXT NOT NULL,
  model       JSONB NOT NULL,
  report      JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS crypto_meta_holdout (
  id            INT PRIMARY KEY CHECK (id = 1),
  holdout_from  TIMESTAMPTZ NOT NULL,
  holdout_to    TIMESTAMPTZ NOT NULL,
  locked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  looks         INT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS crypto_meta_scores (
  signal_id   TEXT PRIMARY KEY,
  model_id    TEXT,
  coin        TEXT NOT NULL,
  product     TEXT,
  signal_at   TIMESTAMPTZ NOT NULL,
  scored_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status      TEXT NOT NULL CHECK (status IN ('SCORED','UNAVAILABLE')),
  reason      TEXT,
  probs       JSONB,
  features    JSONB
);
CREATE INDEX IF NOT EXISTS crypto_meta_scores_signal_idx ON crypto_meta_scores (signal_at);
