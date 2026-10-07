-- Exit selection in shadow (Phase 5): trained selectors and the locked holdout's look count (research only).
CREATE TABLE IF NOT EXISTS crypto_exit_models (
  model_id    TEXT PRIMARY KEY,
  trained_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  run_id      TEXT NOT NULL,
  version     TEXT NOT NULL,
  model       JSONB NOT NULL,
  report      JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS crypto_exit_holdout (
  id            INT PRIMARY KEY CHECK (id = 1),
  holdout_from  TIMESTAMPTZ NOT NULL,
  holdout_to    TIMESTAMPTZ NOT NULL,
  locked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  looks         INT NOT NULL DEFAULT 0
);
