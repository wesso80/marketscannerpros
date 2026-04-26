-- Migration 063: Admin morning brief feedback loop
-- Captures the operator's explicit labels on daily brief candidates.

CREATE TABLE IF NOT EXISTS admin_morning_brief_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('taken', 'ignored', 'missed', 'worked', 'failed', 'invalidated')),
  market TEXT,
  timeframe TEXT,
  permission TEXT,
  bias TEXT,
  playbook TEXT,
  confidence NUMERIC(6,2),
  note TEXT,
  snapshot JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_mbf_symbol_created
  ON admin_morning_brief_feedback (symbol, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_mbf_action_created
  ON admin_morning_brief_feedback (action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_mbf_brief
  ON admin_morning_brief_feedback (brief_id);