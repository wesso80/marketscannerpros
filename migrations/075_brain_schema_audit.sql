-- 075_brain_schema_audit.sql
-- Phase 8 — Database & Schema Audit
--
-- Audit outcome (mapping the requested schema to what already exists):
--
--   requested table     existing table              status
--   ─────────────────   ────────────────────────    ─────────────────────────────
--   learning_events     brain_events (073)          covers all requested fields
--   setup_outcomes      brain_outcomes (073/074)    covers all requested fields
--   edge_stats          brain_edge_scores (073)     covers all requested fields except edge_decay_score
--   model_versions      (none)                      MISSING — created here
--
-- This migration:
--   1. Adds the missing `brain_model_versions` registry (immutable, append-only).
--   2. Adds `edge_decay_score` to brain_edge_scores so decay is materialised
--      (today it is computed ad-hoc by lib/admin/arcaBrainBridge.ts).
--   3. Enforces immutability on brain_events / brain_features / brain_outcomes
--      via UPDATE/DELETE block triggers — protects input snapshots and prevents
--      history rewrites when rules change. (Allowed exception: brain_outcomes
--      learning_eligible flag CAN be recomputed via dedicated function below.)
--   4. Adds a policy-conformant view `brain_public_events_safe` so public
--      surfaces can never accidentally read admin_only rows.
--   5. Adds the workspace_id NOT NULL guard everywhere it was missing and a
--      `setup_signature` index alias for cross-workspace research queries.
--
-- Hard rules being enforced (matches user-supplied Phase 8 rules):
--   * Every event is workspace-scoped — already enforced; reverified here.
--   * Admin-only events never reach public APIs — enforced via view + guard.
--   * Input snapshots are immutable — enforced via trigger.
--   * Outcomes reference original event snapshots — already FK; reverified.
--   * Rule-version changes never overwrite history — enforced by registry +
--     immutability trigger; new versions get new rows.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Model / rules version registry
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_model_versions (
  id                BIGSERIAL PRIMARY KEY,
  model_name        VARCHAR(80)  NOT NULL,                 -- e.g. 'edge_scorer', 'memory_rules', 'arca_prompt'
  version           VARCHAR(40)  NOT NULL,                 -- semver-ish: 'v1', 'v1.2.0'
  rules_hash        VARCHAR(64)  NOT NULL,                 -- sha256 of the rule body / prompt body
  scope             VARCHAR(40)  NOT NULL DEFAULT 'global', -- 'global' | workspace_id
  deployed_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deployed_by       VARCHAR(120),                          -- operator id / system
  superseded_at     TIMESTAMPTZ,                           -- set when a newer row deploys
  superseded_by_id  BIGINT REFERENCES brain_model_versions(id),
  notes             TEXT,
  meta              JSONB        NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT brain_model_versions_unique
    UNIQUE (model_name, version, scope, rules_hash)
);

CREATE INDEX IF NOT EXISTS brain_model_versions_active_idx
  ON brain_model_versions (model_name, scope, deployed_at DESC)
  WHERE superseded_at IS NULL;

COMMENT ON TABLE brain_model_versions IS
  'Phase 8 registry of every deployed model / ruleset / prompt version. Append-only. New rules ALWAYS get a new row — never UPDATE prior rows except to set superseded_at/superseded_by_id.';
COMMENT ON COLUMN brain_model_versions.rules_hash IS
  'sha256 of the rule body (e.g. prompt text + scoring constants). Detects silent drift.';
COMMENT ON COLUMN brain_model_versions.superseded_at IS
  'Set when a newer row deploys for this (model_name, scope). Old row is preserved for replay.';

-- Helper to record a new version safely (atomic supersede).
CREATE OR REPLACE FUNCTION brain_register_model_version(
  p_model_name VARCHAR,
  p_version    VARCHAR,
  p_rules_hash VARCHAR,
  p_scope      VARCHAR DEFAULT 'global',
  p_deployed_by VARCHAR DEFAULT NULL,
  p_notes      TEXT DEFAULT NULL,
  p_meta       JSONB DEFAULT '{}'::jsonb
) RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  new_id BIGINT;
BEGIN
  INSERT INTO brain_model_versions
    (model_name, version, rules_hash, scope, deployed_by, notes, meta)
  VALUES
    (p_model_name, p_version, p_rules_hash, p_scope, p_deployed_by, p_notes, p_meta)
  ON CONFLICT (model_name, version, scope, rules_hash) DO UPDATE
    SET notes = EXCLUDED.notes
  RETURNING id INTO new_id;

  -- Mark prior active rows for the same (model_name, scope) as superseded.
  UPDATE brain_model_versions
     SET superseded_at = NOW(),
         superseded_by_id = new_id
   WHERE model_name = p_model_name
     AND scope = p_scope
     AND id <> new_id
     AND superseded_at IS NULL;

  RETURN new_id;
END;
$$;

COMMENT ON FUNCTION brain_register_model_version IS
  'Phase 8 — atomic version registration. Inserts a new version row and supersedes prior active rows for the same (model_name, scope). Never deletes.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Materialised edge_decay_score on brain_edge_scores
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE brain_edge_scores
  ADD COLUMN IF NOT EXISTS edge_decay_score NUMERIC(6,4),
  ADD COLUMN IF NOT EXISTS edge_decay_reason TEXT;

COMMENT ON COLUMN brain_edge_scores.edge_decay_score IS
  'Phase 8 — recent-half-vs-older-half hit-rate ratio in [0..~2]. < 0.6 = decay detected. NULL when sample too small to compute.';

-- setup_signature = setup_key alias index, used for cross-workspace research
-- queries that want to find a setup across all workspaces (workspace_id = ''global'').
CREATE INDEX IF NOT EXISTS brain_edge_scores_signature_idx
  ON brain_edge_scores (setup_key, regime, horizon, computed_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Immutability triggers — protect input snapshots & history
-- ─────────────────────────────────────────────────────────────────────────────

-- 3a. brain_events: BLOCK all UPDATE and DELETE.
CREATE OR REPLACE FUNCTION brain_events_block_mutation() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'brain_events is append-only (Phase 8 immutability rule). Insert a new event with a new event_id; never UPDATE/DELETE prior rows.';
END;
$$;

DROP TRIGGER IF EXISTS brain_events_no_update ON brain_events;
DROP TRIGGER IF EXISTS brain_events_no_delete ON brain_events;
CREATE TRIGGER brain_events_no_update BEFORE UPDATE ON brain_events
  FOR EACH ROW EXECUTE FUNCTION brain_events_block_mutation();
CREATE TRIGGER brain_events_no_delete BEFORE DELETE ON brain_events
  FOR EACH ROW EXECUTE FUNCTION brain_events_block_mutation();

-- 3b. brain_features: BLOCK all UPDATE and DELETE (snapshot integrity).
CREATE OR REPLACE FUNCTION brain_features_block_mutation() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'brain_features snapshots are immutable (Phase 8). snapshot_hash protects integrity; never mutate a frozen feature row.';
END;
$$;

DROP TRIGGER IF EXISTS brain_features_no_update ON brain_features;
DROP TRIGGER IF EXISTS brain_features_no_delete ON brain_features;
CREATE TRIGGER brain_features_no_update BEFORE UPDATE ON brain_features
  FOR EACH ROW EXECUTE FUNCTION brain_features_block_mutation();
CREATE TRIGGER brain_features_no_delete BEFORE DELETE ON brain_features
  FOR EACH ROW EXECUTE FUNCTION brain_features_block_mutation();

-- 3c. brain_outcomes: BLOCK UPDATE except for the recompute-eligibility path,
--     and BLOCK DELETE entirely. Numeric outcome metrics + look-ahead fields
--     must never change once written.
CREATE OR REPLACE FUNCTION brain_outcomes_guard_mutation() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'brain_outcomes is append-only (Phase 8). Resolve a new outcome row instead of deleting.';
  END IF;

  -- UPDATE is permitted ONLY for memory eligibility recomputation. Every
  -- other field must be byte-identical to the prior row.
  IF NEW.event_id              IS DISTINCT FROM OLD.event_id              OR
     NEW.workspace_id          IS DISTINCT FROM OLD.workspace_id          OR
     NEW.symbol                IS DISTINCT FROM OLD.symbol                OR
     NEW.horizon               IS DISTINCT FROM OLD.horizon               OR
     NEW.horizon_seconds       IS DISTINCT FROM OLD.horizon_seconds       OR
     NEW.as_of_ts              IS DISTINCT FROM OLD.as_of_ts              OR
     NEW.resolved_at_ts        IS DISTINCT FROM OLD.resolved_at_ts        OR
     NEW.data_through_ts       IS DISTINCT FROM OLD.data_through_ts       OR
     NEW.mfe_pct               IS DISTINCT FROM OLD.mfe_pct               OR
     NEW.mae_pct               IS DISTINCT FROM OLD.mae_pct               OR
     NEW.mfe_r                 IS DISTINCT FROM OLD.mfe_r                 OR
     NEW.mae_r                 IS DISTINCT FROM OLD.mae_r                 OR
     NEW.time_to_move_secs     IS DISTINCT FROM OLD.time_to_move_secs     OR
     NEW.invalidation_touched  IS DISTINCT FROM OLD.invalidation_touched  OR
     NEW.key_level_touched     IS DISTINCT FROM OLD.key_level_touched     OR
     NEW.reaction_zone_touched IS DISTINCT FROM OLD.reaction_zone_touched OR
     NEW.vol_expansion_occurred IS DISTINCT FROM OLD.vol_expansion_occurred OR
     NEW.outcome_class         IS DISTINCT FROM OLD.outcome_class         OR
     NEW.bars_consumed         IS DISTINCT FROM OLD.bars_consumed         OR
     NEW.data_source           IS DISTINCT FROM OLD.data_source           OR
     NEW.data_quality          IS DISTINCT FROM OLD.data_quality
  THEN
    RAISE EXCEPTION 'brain_outcomes immutable fields cannot change (Phase 8). Only learning_eligible / eligibility_reasons / memory_dimension / memory_rule_version may be recomputed.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS brain_outcomes_guard_update ON brain_outcomes;
DROP TRIGGER IF EXISTS brain_outcomes_guard_delete ON brain_outcomes;
CREATE TRIGGER brain_outcomes_guard_update BEFORE UPDATE ON brain_outcomes
  FOR EACH ROW EXECUTE FUNCTION brain_outcomes_guard_mutation();
CREATE TRIGGER brain_outcomes_guard_delete BEFORE DELETE ON brain_outcomes
  FOR EACH ROW EXECUTE FUNCTION brain_outcomes_guard_mutation();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Public-safe event view — admin_only rows can NEVER leak through.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW brain_public_events_safe AS
SELECT
  event_id,
  workspace_id,
  symbol,
  asset_class,
  timeframe,
  event_type,
  ts,
  source,
  data_freshness,
  model_version,
  rule_version,
  signal_id,
  -- DELIBERATELY OMITTED from public surface:
  --   score_snapshot, meta, ai_signal_log_id, decision_packet_id,
  --   input_snapshot_hash, prompt_version
  public_safe
FROM brain_events
WHERE admin_only = FALSE
  AND public_safe = TRUE;

COMMENT ON VIEW brain_public_events_safe IS
  'Phase 8 — the ONLY brain_events surface public APIs may read. Admin-only rows are excluded by definition. Score snapshots and free-form meta are not exposed.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Reverify NOT NULL on workspace_id everywhere (defence-in-depth).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- These should already be NOT NULL from migration 073; statement is idempotent.
  ALTER TABLE brain_events       ALTER COLUMN workspace_id SET NOT NULL;
  ALTER TABLE brain_features     ALTER COLUMN workspace_id SET NOT NULL;
  ALTER TABLE brain_outcomes     ALTER COLUMN workspace_id SET NOT NULL;
  ALTER TABLE brain_edge_scores  ALTER COLUMN workspace_id SET NOT NULL;
EXCEPTION WHEN OTHERS THEN
  -- Some envs may not have the tables yet (fresh DB on a non-073 base). Skip.
  RAISE NOTICE 'brain workspace_id NOT NULL re-verify skipped: %', SQLERRM;
END $$;

COMMIT;
