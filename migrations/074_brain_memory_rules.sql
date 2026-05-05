-- 074_brain_memory_rules.sql
-- Phase 5 — Learning Memory Rules
--
-- Adds eligibility flags to brain_outcomes so the edge scorer can ignore
-- outcomes that should NEVER be remembered as edge:
--   - one-off lucky wins (sample-size handled by L4; flagged here at horizon level)
--   - tiny sample-size results
--   - results from stale data
--   - results from simulated/mock data
--   - outcomes during provider failures
--   - results where the input snapshot is missing
--   - results where the horizon is undefined / improperly resolved
--   - results that relied on future information (look-ahead — already CHECK-blocked)
--
-- The flag is computed at outcome-write time from features/event provenance,
-- and re-derivable. The view brain_edge_memory_pool selects only eligible rows.

BEGIN;

ALTER TABLE brain_outcomes
  ADD COLUMN IF NOT EXISTS learning_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS eligibility_reasons TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS memory_dimension VARCHAR(60),
  ADD COLUMN IF NOT EXISTS memory_rule_version VARCHAR(20) NOT NULL DEFAULT 'v1';

CREATE INDEX IF NOT EXISTS brain_outcomes_eligible_idx
  ON brain_outcomes (workspace_id, learning_eligible, memory_dimension)
  WHERE learning_eligible = TRUE;

COMMENT ON COLUMN brain_outcomes.learning_eligible IS
  'Computed at write-time. TRUE only when memory rules pass: clean data, valid snapshot, valid horizon, no provider failure, no simulated source.';
COMMENT ON COLUMN brain_outcomes.eligibility_reasons IS
  'When learning_eligible = FALSE, lists the specific rule(s) that disqualified the row. When TRUE, lists the dimensions this row contributes to.';
COMMENT ON COLUMN brain_outcomes.memory_dimension IS
  'Which of the 13 memory dimensions this outcome primarily contributes to (setup_by_regime | symbol_false_positive | timeframe_noise | confluence_predictive | etc.).';

-- ─────────────────────────────────────────────────────────────────────────────
-- Pool view — what the edge scorer is allowed to see
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW brain_edge_memory_pool AS
SELECT
  o.outcome_id,
  o.event_id,
  o.workspace_id,
  o.symbol,
  o.horizon,
  o.horizon_seconds,
  o.as_of_ts,
  o.resolved_at_ts,
  o.data_through_ts,
  o.mfe_pct,
  o.mae_pct,
  o.mfe_r,
  o.mae_r,
  o.outcome_class,
  o.bars_consumed,
  o.data_source,
  o.data_quality,
  o.memory_dimension,
  o.eligibility_reasons,
  e.event_type,
  e.source         AS event_source,
  e.data_freshness AS event_data_freshness,
  e.model_version,
  e.rule_version,
  e.score_snapshot,
  e.meta           AS event_meta,
  f.snapshot_hash,
  f.feature_schema_version,
  f.market_structure,
  f.volatility,
  f.options,
  f.derivatives,
  f.time_context,
  f.missing_data_count,
  f.stale_data_count,
  f.simulated_field_count
FROM brain_outcomes o
JOIN brain_events   e ON e.event_id = o.event_id
LEFT JOIN brain_features f ON f.event_id = o.event_id
WHERE o.learning_eligible = TRUE
  AND e.data_freshness NOT IN ('stale', 'simulated', 'unknown')
  AND COALESCE(f.simulated_field_count, 0) = 0;

COMMENT ON VIEW brain_edge_memory_pool IS
  'Phase 5: the ONLY surface the edge scorer should aggregate from. Filters out stale/simulated/ineligible outcomes.';

COMMIT;
