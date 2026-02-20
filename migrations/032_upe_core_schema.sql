-- =====================================================
-- 032_upe_core_schema.sql
-- Purpose: Unified Permission Engine (UPE) core schema
-- Safe to run multiple times (idempotent)
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS global_regime_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('open', 'close')),
  regime TEXT NOT NULL CHECK (regime IN ('risk_on', 'neutral', 'risk_off')),
  capital_mode TEXT NOT NULL CHECK (capital_mode IN ('normal', 'reduced', 'defensive')),
  volatility_state TEXT,
  liquidity_state TEXT,
  adaptive_confidence NUMERIC,
  components_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_global_regime_created_at
  ON global_regime_snapshots (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_global_regime_snapshot_type_created
  ON global_regime_snapshots (snapshot_type, created_at DESC);

CREATE TABLE IF NOT EXISTS crcs_hourly_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  asset_class TEXT NOT NULL,
  cluster TEXT,
  global_eligibility TEXT NOT NULL CHECK (global_eligibility IN ('eligible', 'conditional', 'blocked')),
  confluence_score NUMERIC,
  rar_score NUMERIC,
  crcs_base NUMERIC,
  micro_adjustment NUMERIC,
  crcs_final NUMERIC,
  capital_mode TEXT NOT NULL CHECK (capital_mode IN ('normal', 'reduced', 'defensive')),
  regime_snapshot_id UUID REFERENCES global_regime_snapshots(id),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crcs_asset_time
  ON crcs_hourly_base (asset_class, computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_crcs_symbol_time
  ON crcs_hourly_base (symbol, computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_crcs_asset_eligibility_rank
  ON crcs_hourly_base (asset_class, global_eligibility, crcs_final DESC, confluence_score DESC, computed_at DESC);

CREATE TABLE IF NOT EXISTS tenant_profiles (
  user_id UUID PRIMARY KEY,
  preset TEXT NOT NULL CHECK (preset IN ('conservative', 'balanced', 'aggressive')),
  sizing_modifier NUMERIC NOT NULL CHECK (sizing_modifier >= 0.6 AND sizing_modifier <= 1.0),
  vol_tolerance TEXT NOT NULL CHECK (vol_tolerance IN ('low', 'med', 'high')),
  tighten_overrides_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  block_microcaps BOOLEAN NOT NULL DEFAULT FALSE,
  block_high_beta BOOLEAN NOT NULL DEFAULT FALSE,
  only_large_mid BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_profiles_preset
  ON tenant_profiles (preset, updated_at DESC);

CREATE TABLE IF NOT EXISTS override_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  previous_state JSONB,
  new_state JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_override_log_user_created
  ON override_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_override_log_active
  ON override_log (expires_at, revoked_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS micro_regime_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_class TEXT NOT NULL,
  micro_state TEXT NOT NULL,
  adjustment_cap NUMERIC,
  components_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_micro_regime_asset_time
  ON micro_regime_snapshots (asset_class, computed_at DESC);
