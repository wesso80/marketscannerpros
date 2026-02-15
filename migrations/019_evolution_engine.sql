-- Institutional Evolution Engine persistence

CREATE TABLE IF NOT EXISTS evolution_adjustments (
  id BIGSERIAL PRIMARY KEY,
  workspace_id UUID NOT NULL,
  symbol_group VARCHAR(80) NOT NULL,
  cadence VARCHAR(20) NOT NULL,
  learning_period VARCHAR(40) NOT NULL,
  confidence FLOAT NOT NULL,
  changes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  adjustments_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT evolution_adjustments_cadence_check CHECK (cadence IN ('daily', 'weekly', 'monthly'))
);

CREATE INDEX IF NOT EXISTS idx_evolution_adjustments_ws_created
  ON evolution_adjustments (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_evolution_adjustments_group
  ON evolution_adjustments (workspace_id, symbol_group, created_at DESC);
