-- =====================================================
-- 021_operator_state.sql
-- Purpose: Invisible layer foundation (live operator state pulse)
-- Safe to run multiple times (idempotent)
-- =====================================================

CREATE TABLE IF NOT EXISTS operator_state (
  workspace_id UUID PRIMARY KEY,
  current_focus TEXT,
  active_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  risk_environment TEXT,
  ai_attention_score NUMERIC(6,2),
  user_mode TEXT,
  cognitive_load NUMERIC(6,2),
  context_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_module TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operator_state_updated_at
  ON operator_state (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_operator_state_user_mode
  ON operator_state (user_mode);

CREATE INDEX IF NOT EXISTS idx_operator_state_focus
  ON operator_state (current_focus);
