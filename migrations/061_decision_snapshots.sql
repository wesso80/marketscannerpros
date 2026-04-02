-- 061_decision_snapshots.sql
-- Persists operator decision replay snapshots for auditability.
-- Each scan produces one snapshot per symbol processed.

CREATE TABLE IF NOT EXISTS decision_snapshots (
  id              SERIAL PRIMARY KEY,
  snapshot_id     TEXT         NOT NULL UNIQUE,
  request_id      TEXT         NOT NULL,
  symbol          TEXT         NOT NULL,
  snapshot        JSONB        NOT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decision_snapshots_symbol
  ON decision_snapshots (symbol, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_decision_snapshots_request
  ON decision_snapshots (request_id);

CREATE INDEX IF NOT EXISTS idx_decision_snapshots_created
  ON decision_snapshots (created_at DESC);
