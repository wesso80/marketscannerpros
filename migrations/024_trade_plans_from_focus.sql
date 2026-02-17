-- =====================================================
-- 024_trade_plans_from_focus.sql
-- Purpose: Persist focus-generated trade plan drafts
-- Safe to run multiple times (idempotent)
-- =====================================================

CREATE TABLE IF NOT EXISTS trade_plans (
  workspace_id VARCHAR(100) NOT NULL,
  plan_id VARCHAR(180) NOT NULL,
  decision_packet_id VARCHAR(160),
  symbol VARCHAR(24) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'draft',
  draft_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, plan_id),
  CONSTRAINT trade_plans_status_check CHECK (status IN ('draft', 'ready', 'executed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_trade_plans_workspace_symbol_updated
  ON trade_plans (workspace_id, symbol, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_trade_plans_workspace_packet_updated
  ON trade_plans (workspace_id, decision_packet_id, updated_at DESC);
