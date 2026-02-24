-- ============================================================
-- Migration 043: study_jobs — Track catalyst study computation
-- Prevents "stuck computing" by giving jobs explicit lifecycle.
-- ============================================================

CREATE TABLE IF NOT EXISTS study_jobs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_key    VARCHAR(200) NOT NULL,  -- "TICKER:SUBTYPE:COHORT:LOOKBACK"
  status       VARCHAR(20)  NOT NULL DEFAULT 'queued',  -- queued | running | done | failed
  progress     INT          NOT NULL DEFAULT 0,   -- events processed
  total        INT          NOT NULL DEFAULT 0,   -- total events to process
  error        TEXT,
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Only one active job per study key
CREATE UNIQUE INDEX IF NOT EXISTS idx_study_jobs_active
  ON study_jobs (study_key) WHERE status IN ('queued', 'running');

-- Cleanup: find stale jobs
CREATE INDEX IF NOT EXISTS idx_study_jobs_status
  ON study_jobs (status, created_at);
