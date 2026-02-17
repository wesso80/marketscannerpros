-- =====================================================
-- 025_engine_jobs.sql
-- Purpose: Durable async engine queue for background processing
-- Safe to run multiple times (idempotent)
-- =====================================================

CREATE TABLE IF NOT EXISTS engine_jobs (
  id BIGSERIAL PRIMARY KEY,
  workspace_id VARCHAR(100) NOT NULL,
  job_type VARCHAR(120) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key VARCHAR(180),
  priority INTEGER NOT NULL DEFAULT 100,
  run_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  lock_token VARCHAR(120),
  locked_at TIMESTAMPTZ,
  locked_by VARCHAR(120),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT engine_jobs_status_check CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_engine_jobs_workspace_dedupe
  ON engine_jobs (workspace_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_engine_jobs_pending_scan
  ON engine_jobs (status, run_after, priority, id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_engine_jobs_workspace_created
  ON engine_jobs (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS engine_job_runs (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES engine_jobs(id) ON DELETE CASCADE,
  workspace_id VARCHAR(100) NOT NULL,
  worker_id VARCHAR(120) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  success BOOLEAN,
  error TEXT,
  result JSONB
);

CREATE INDEX IF NOT EXISTS idx_engine_job_runs_job_id
  ON engine_job_runs (job_id, started_at DESC);
