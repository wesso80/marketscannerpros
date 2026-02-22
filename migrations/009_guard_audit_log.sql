-- Guard toggle audit trail
-- Tracks when users enable/disable the risk governor guard
CREATE TABLE IF NOT EXISTS guard_audit_log (
  id            SERIAL PRIMARY KEY,
  workspace_id  UUID NOT NULL,
  action        TEXT NOT NULL CHECK (action IN ('ENABLE', 'DISABLE')),
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source        TEXT DEFAULT 'preferences_api'
);

CREATE INDEX IF NOT EXISTS idx_guard_audit_workspace ON guard_audit_log (workspace_id, timestamp DESC);
