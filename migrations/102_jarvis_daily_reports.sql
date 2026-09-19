-- =====================================================
-- 102_jarvis_daily_reports.sql
-- One daily intelligence report per US session, built from a completed jarvis_runs row.
-- Kept separate from jarvis_runs on purpose: a run is a scan artefact (large payload,
-- overwritten on re-run); a report is a delivery artefact with its own health/email lifecycle.
-- Idempotent.
-- =====================================================

CREATE TABLE IF NOT EXISTS jarvis_daily_reports (
  id               BIGSERIAL PRIMARY KEY,
  session_date     DATE NOT NULL UNIQUE,                       -- US market session the report describes
  run_id           TEXT REFERENCES jarvis_runs(run_key) ON DELETE SET NULL,
  report_version   INTEGER NOT NULL DEFAULT 1,
  status           TEXT NOT NULL CHECK (status IN ('COMPLETE', 'DEGRADED', 'FAILED')),
  health_status    TEXT NOT NULL CHECK (health_status IN ('NORMAL', 'DEGRADED', 'FAILED')),
  headline         TEXT NOT NULL,
  report_json      JSONB NOT NULL,
  report_markdown  TEXT NOT NULL,
  generated_at     TIMESTAMPTZ NOT NULL,
  email_status     TEXT NOT NULL DEFAULT 'NOT_REQUESTED'
                   CHECK (email_status IN ('NOT_REQUESTED', 'NO_RECIPIENT', 'PENDING', 'SENT', 'FAILED', 'SUPPRESSED_HEALTH')),
  email_sent_at    TIMESTAMPTZ,
  email_message_id TEXT,
  email_error      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jarvis_daily_reports_generated ON jarvis_daily_reports (generated_at DESC);
