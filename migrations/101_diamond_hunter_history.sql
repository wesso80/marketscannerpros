-- Diamond Hunter V2 — durable discovery history, confirmation state, and forward outcomes.
-- Runtime code also calls CREATE TABLE IF NOT EXISTS so a deploy remains safe if this
-- migration has not yet been applied manually.

CREATE TABLE IF NOT EXISTS diamond_hunter_candidates (
  pool_id TEXT PRIMARY KEY,
  network TEXT NOT NULL,
  pool_address TEXT NOT NULL,
  token_address TEXT,
  symbol TEXT,
  name TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_detected_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_price_usd NUMERIC,
  latest_price_usd NUMERIC,
  first_liquidity_usd NUMERIC,
  latest_liquidity_usd NUMERIC,
  first_score INTEGER,
  latest_score INTEGER,
  peak_score INTEGER,
  scan_count INTEGER NOT NULL DEFAULT 0,
  qualifying_scan_count INTEGER NOT NULL DEFAULT 0,
  diamond_scan_count INTEGER NOT NULL DEFAULT 0,
  deep_check_count INTEGER NOT NULL DEFAULT 0,
  first_trending_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  latest_attention TEXT,
  latest_stage TEXT,
  latest_validation_stage TEXT,
  last_risk_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_diamond_candidates_detected
  ON diamond_hunter_candidates (first_detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_diamond_candidates_validation
  ON diamond_hunter_candidates (latest_validation_stage, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS diamond_hunter_snapshots (
  id BIGSERIAL PRIMARY KEY,
  pool_id TEXT NOT NULL REFERENCES diamond_hunter_candidates(pool_id) ON DELETE CASCADE,
  scanned_at TIMESTAMPTZ NOT NULL,
  score INTEGER NOT NULL,
  stage TEXT NOT NULL,
  validation_stage TEXT NOT NULL,
  confidence TEXT NOT NULL,
  attention TEXT NOT NULL,
  price_usd NUMERIC,
  liquidity_usd NUMERIC,
  fdv_usd NUMERIC,
  volume_5m_usd NUMERIC,
  buyers_5m INTEGER,
  sellers_5m INTEGER,
  score_delta_5m NUMERIC,
  liquidity_change_pct NUMERIC,
  hard_reject BOOLEAN NOT NULL DEFAULT FALSE,
  risk_flags JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_diamond_snapshots_pool_time
  ON diamond_hunter_snapshots (pool_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_diamond_snapshots_time
  ON diamond_hunter_snapshots (scanned_at DESC);

CREATE TABLE IF NOT EXISTS diamond_hunter_outcomes (
  pool_id TEXT NOT NULL REFERENCES diamond_hunter_candidates(pool_id) ON DELETE CASCADE,
  horizon TEXT NOT NULL CHECK (horizon IN ('1h','6h','24h','72h','7d')),
  target_at TIMESTAMPTZ NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  start_price_usd NUMERIC,
  observed_price_usd NUMERIC,
  return_pct NUMERIC,
  mfe_pct NUMERIC,
  mae_pct NUMERIC,
  liquidity_change_pct NUMERIC,
  discovery_lead_minutes NUMERIC,
  PRIMARY KEY (pool_id, horizon)
);

CREATE INDEX IF NOT EXISTS idx_diamond_outcomes_observed
  ON diamond_hunter_outcomes (observed_at DESC);
