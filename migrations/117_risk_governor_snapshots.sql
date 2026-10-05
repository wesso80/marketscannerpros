-- =====================================================
-- 117_risk_governor_snapshots.sql
-- Purpose: table read by GET /api/regime for the account risk-governor signal.
-- The route selects risk_mode, data_health, updated_at by workspace_id.
-- Safe to run multiple times (idempotent). Nothing in the app inserts rows yet.
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS risk_governor_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  risk_mode TEXT,
  data_health TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_governor_snapshots_workspace_updated
  ON risk_governor_snapshots (workspace_id, updated_at DESC);
