-- Migration 064: Admin morning brief snapshots
-- Stores the generated daily operator brief so future sessions can compare what changed.

CREATE TABLE IF NOT EXISTS admin_morning_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id TEXT NOT NULL UNIQUE,
  generated_at TIMESTAMPTZ NOT NULL,
  market TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  desk_state TEXT NOT NULL,
  headline TEXT NOT NULL,
  top_play_count INTEGER NOT NULL DEFAULT 0,
  watch_count INTEGER NOT NULL DEFAULT 0,
  avoid_count INTEGER NOT NULL DEFAULT 0,
  catalyst_count INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'admin',
  snapshot JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_morning_briefs_generated
  ON admin_morning_briefs (generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_morning_briefs_state
  ON admin_morning_briefs (desk_state, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_morning_briefs_market_timeframe_generated
  ON admin_morning_briefs (market, timeframe, generated_at DESC);