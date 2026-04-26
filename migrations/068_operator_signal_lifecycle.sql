-- =====================================================
-- 068_operator_signal_lifecycle.sql
-- Purpose: Add lifecycle and expectancy fields to admin/operator signal memory.
-- Safe to run multiple times.
-- =====================================================

ALTER TABLE ai_signal_log
  ADD COLUMN IF NOT EXISTS lifecycle_state VARCHAR(30) NOT NULL DEFAULT 'DISCOVERED',
  ADD COLUMN IF NOT EXISTS triggered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invalidated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS target_1_hit_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stop_hit_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS max_favorable_pct NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS max_adverse_pct NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS expectancy_r NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS elite_score NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS elite_grade VARCHAR(4),
  ADD COLUMN IF NOT EXISTS setup_state VARCHAR(30),
  ADD COLUMN IF NOT EXISTS trigger_distance_pct NUMERIC(10,4);

CREATE INDEX IF NOT EXISTS idx_ai_signal_lifecycle
  ON ai_signal_log(workspace_id, lifecycle_state, signal_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_signal_elite_score
  ON ai_signal_log(workspace_id, elite_score DESC, signal_at DESC);

COMMENT ON COLUMN ai_signal_log.lifecycle_state IS 'Operator lifecycle: DISCOVERED, WATCHING, TRIGGERED, TARGET_1_HIT, STOPPED, INVALIDATED, MISSED, EXPIRED.';
COMMENT ON COLUMN ai_signal_log.elite_score IS 'Composite private operator score: edge, timing, liquidity, asymmetry, cleanliness, and risk permission.';
