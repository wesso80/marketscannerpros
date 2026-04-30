-- Phase 9: Research Scheduler Runs
-- Logs every 24/7 research scheduler run for monitoring, replay, and auditing.

CREATE TABLE IF NOT EXISTS admin_research_scheduler_runs (
  id                BIGSERIAL PRIMARY KEY,
  run_id            VARCHAR(120) NOT NULL UNIQUE,
  workspace_id      VARCHAR(100) NOT NULL,
  mode              VARCHAR(40) NOT NULL,
  market            VARCHAR(20) NOT NULL,
  timeframe         VARCHAR(20) NOT NULL,
  started_at        TIMESTAMPTZ NOT NULL,
  completed_at      TIMESTAMPTZ,
  symbols_scanned   INT NOT NULL DEFAULT 0,
  errors            JSONB,
  stale_data        INT NOT NULL DEFAULT 0,
  alerts_fired      INT NOT NULL DEFAULT 0,
  alerts_suppressed INT NOT NULL DEFAULT 0,
  runtime_ms        INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_research_scheduler_workspace
  ON admin_research_scheduler_runs (workspace_id, created_at DESC);
