-- 060_operator_weights.sql
-- Persists adaptive scoring weights for the MSP Operator learning engine.
-- Append-only log: each adjustment inserts a new row. Latest row = active weights.

CREATE TABLE IF NOT EXISTS operator_weights (
  id              SERIAL PRIMARY KEY,
  weights         JSONB        NOT NULL,
  previous_weights JSONB,
  adjustments     JSONB,
  mode            TEXT         NOT NULL DEFAULT 'MANUAL_APPROVED',
  applied_by      TEXT         NOT NULL DEFAULT 'operator',
  applied_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Index for fast "latest row" lookup
CREATE INDEX IF NOT EXISTS idx_operator_weights_applied_at
  ON operator_weights (applied_at DESC);
