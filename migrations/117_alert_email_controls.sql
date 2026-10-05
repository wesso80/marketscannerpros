-- Alert email cap, daily digest, unsubscribe preference, and Resend suppression.
-- The owner runs this by hand in Neon. Safe to run more than once.
-- Until it has been run, alert mail fails safe: no per-alert emails.

CREATE TABLE IF NOT EXISTS alert_email_prefs (
  workspace_id VARCHAR(100) PRIMARY KEY,
  mode VARCHAR(16) NOT NULL DEFAULT 'digest',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT alert_email_prefs_mode_check CHECK (mode IN ('digest', 'each', 'off'))
);

CREATE TABLE IF NOT EXISTS alert_email_suppressions (
  email VARCHAR(320) PRIMARY KEY,
  reason VARCHAR(32) NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_email_daily_counts (
  workspace_id VARCHAR(100) NOT NULL,
  sydney_day DATE NOT NULL,
  sent_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, sydney_day)
);

CREATE TABLE IF NOT EXISTS alert_email_digest_items (
  id BIGSERIAL PRIMARY KEY,
  workspace_id VARCHAR(100) NOT NULL,
  email VARCHAR(320) NOT NULL,
  sydney_day DATE NOT NULL,
  subject TEXT NOT NULL,
  line TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alert_email_digest_unsent
  ON alert_email_digest_items (sydney_day, workspace_id)
  WHERE sent_at IS NULL;
