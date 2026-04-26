-- Migration 067: Admin morning brief outcome grades
-- Stores auto-grades that compare saved morning briefs with later review labels and closed journal outcomes.

CREATE TABLE IF NOT EXISTS admin_morning_brief_outcome_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id TEXT NOT NULL UNIQUE,
  generated_at TIMESTAMPTZ,
  grade TEXT NOT NULL,
  total_plays INTEGER NOT NULL DEFAULT 0,
  worked INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  missed INTEGER NOT NULL DEFAULT 0,
  invalidated INTEGER NOT NULL DEFAULT 0,
  unreviewed INTEGER NOT NULL DEFAULT 0,
  closed_trades INTEGER NOT NULL DEFAULT 0,
  total_pl NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_r NUMERIC(12,4) NOT NULL DEFAULT 0,
  summary TEXT NOT NULL,
  snapshot JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_mbog_generated
  ON admin_morning_brief_outcome_grades (generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_mbog_grade
  ON admin_morning_brief_outcome_grades (grade, generated_at DESC);
