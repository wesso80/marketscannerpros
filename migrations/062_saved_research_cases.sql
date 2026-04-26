CREATE TABLE IF NOT EXISTS saved_research_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id VARCHAR(100) NOT NULL,
  symbol VARCHAR(32) NOT NULL,
  asset_class VARCHAR(24) NOT NULL DEFAULT 'equity',
  source_type VARCHAR(40) NOT NULL DEFAULT 'manual',
  title VARCHAR(160),
  data_quality VARCHAR(16) NOT NULL DEFAULT 'MISSING',
  generated_at TIMESTAMPTZ,
  lifecycle_state VARCHAR(20),
  lifecycle_updated_at TIMESTAMPTZ,
  state_snapshot_json JSONB,
  outcome_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  outcome_note TEXT,
  outcome_reviewed_at TIMESTAMPTZ,
  outcome_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE saved_research_cases
  ADD COLUMN IF NOT EXISTS lifecycle_state VARCHAR(20),
  ADD COLUMN IF NOT EXISTS lifecycle_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS state_snapshot_json JSONB,
  ADD COLUMN IF NOT EXISTS outcome_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS outcome_note TEXT,
  ADD COLUMN IF NOT EXISTS outcome_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outcome_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE saved_research_cases
SET
  symbol = COALESCE(NULLIF(UPPER(TRIM(symbol)), ''), 'UNKNOWN'),
  asset_class = CASE
    WHEN LOWER(COALESCE(asset_class, '')) IN ('equity', 'crypto', 'forex', 'commodity', 'options') THEN LOWER(asset_class)
    WHEN LOWER(COALESCE(asset_class, '')) = 'commodities' THEN 'commodity'
    ELSE 'equity'
  END,
  source_type = LOWER(COALESCE(NULLIF(TRIM(source_type), ''), 'manual')),
  data_quality = CASE
    WHEN UPPER(COALESCE(data_quality, '')) IN ('GOOD', 'DEGRADED', 'STALE', 'MISSING', 'LIVE') THEN UPPER(data_quality)
    ELSE 'MISSING'
  END,
  lifecycle_state = CASE
    WHEN UPPER(COALESCE(lifecycle_state, '')) IN ('SCAN', 'WATCH', 'STALK', 'ARMED', 'EXECUTE', 'MANAGE', 'COOLDOWN', 'BLOCKED') THEN UPPER(lifecycle_state)
    ELSE NULL
  END,
  outcome_status = CASE
    WHEN LOWER(COALESCE(outcome_status, '')) IN ('pending', 'confirmed', 'invalidated', 'expired', 'reviewed') THEN LOWER(outcome_status)
    ELSE 'pending'
  END,
  outcome_metadata = COALESCE(outcome_metadata, '{}'::jsonb),
  created_at = COALESCE(created_at, NOW()),
  updated_at = COALESCE(updated_at, NOW())
WHERE symbol IS NULL OR symbol = '' OR symbol <> UPPER(TRIM(symbol))
  OR asset_class IS NULL OR LOWER(asset_class) NOT IN ('equity', 'crypto', 'forex', 'commodity', 'commodities', 'options') OR asset_class <> LOWER(asset_class)
  OR source_type IS NULL OR source_type <> LOWER(COALESCE(NULLIF(TRIM(source_type), ''), 'manual'))
  OR data_quality IS NULL OR UPPER(data_quality) NOT IN ('GOOD', 'DEGRADED', 'STALE', 'MISSING', 'LIVE') OR data_quality <> UPPER(data_quality)
  OR lifecycle_state IS NOT NULL AND UPPER(lifecycle_state) NOT IN ('SCAN', 'WATCH', 'STALK', 'ARMED', 'EXECUTE', 'MANAGE', 'COOLDOWN', 'BLOCKED')
  OR lifecycle_state IS NOT NULL AND lifecycle_state <> UPPER(lifecycle_state)
  OR outcome_status IS NULL OR LOWER(outcome_status) NOT IN ('pending', 'confirmed', 'invalidated', 'expired', 'reviewed') OR outcome_status <> LOWER(outcome_status)
  OR outcome_metadata IS NULL
  OR created_at IS NULL
  OR updated_at IS NULL;

ALTER TABLE saved_research_cases
  ALTER COLUMN asset_class SET DEFAULT 'equity',
  ALTER COLUMN source_type SET DEFAULT 'manual',
  ALTER COLUMN data_quality SET DEFAULT 'MISSING',
  ALTER COLUMN outcome_status SET DEFAULT 'pending',
  ALTER COLUMN outcome_metadata SET DEFAULT '{}'::jsonb,
  ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE saved_research_cases
  ALTER COLUMN symbol SET NOT NULL,
  ALTER COLUMN asset_class SET NOT NULL,
  ALTER COLUMN source_type SET NOT NULL,
  ALTER COLUMN data_quality SET NOT NULL,
  ALTER COLUMN outcome_status SET NOT NULL,
  ALTER COLUMN outcome_metadata SET NOT NULL,
  ALTER COLUMN payload SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'saved_research_cases_symbol_check' AND conrelid = 'saved_research_cases'::regclass
  ) THEN
    ALTER TABLE saved_research_cases
      ADD CONSTRAINT saved_research_cases_symbol_check
      CHECK (symbol <> '' AND symbol ~ '^[A-Z0-9.\-/=^]+$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'saved_research_cases_asset_class_check' AND conrelid = 'saved_research_cases'::regclass
  ) THEN
    ALTER TABLE saved_research_cases
      ADD CONSTRAINT saved_research_cases_asset_class_check
      CHECK (asset_class IN ('equity', 'crypto', 'forex', 'commodity', 'options'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'saved_research_cases_source_type_check' AND conrelid = 'saved_research_cases'::regclass
  ) THEN
    ALTER TABLE saved_research_cases
      ADD CONSTRAINT saved_research_cases_source_type_check
      CHECK (source_type <> '');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'saved_research_cases_data_quality_check' AND conrelid = 'saved_research_cases'::regclass
  ) THEN
    ALTER TABLE saved_research_cases
      ADD CONSTRAINT saved_research_cases_data_quality_check
      CHECK (data_quality IN ('GOOD', 'DEGRADED', 'STALE', 'MISSING', 'LIVE'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'saved_research_cases_lifecycle_state_check' AND conrelid = 'saved_research_cases'::regclass
  ) THEN
    ALTER TABLE saved_research_cases
      ADD CONSTRAINT saved_research_cases_lifecycle_state_check
      CHECK (lifecycle_state IS NULL OR lifecycle_state IN ('SCAN', 'WATCH', 'STALK', 'ARMED', 'EXECUTE', 'MANAGE', 'COOLDOWN', 'BLOCKED'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'saved_research_cases_outcome_status_check' AND conrelid = 'saved_research_cases'::regclass
  ) THEN
    ALTER TABLE saved_research_cases
      ADD CONSTRAINT saved_research_cases_outcome_status_check
      CHECK (outcome_status IN ('pending', 'confirmed', 'invalidated', 'expired', 'reviewed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_saved_research_cases_workspace_created
  ON saved_research_cases (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_saved_research_cases_workspace_symbol
  ON saved_research_cases (workspace_id, symbol, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_saved_research_cases_workspace_quality
  ON saved_research_cases (workspace_id, data_quality, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_saved_research_cases_workspace_lifecycle
  ON saved_research_cases (workspace_id, lifecycle_state, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_saved_research_cases_workspace_outcome
  ON saved_research_cases (workspace_id, outcome_status, created_at DESC);