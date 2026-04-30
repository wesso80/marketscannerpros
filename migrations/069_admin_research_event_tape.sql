-- Phase 9: Research Event Tape
-- Stores admin research events (alerts, traps, bias flags, scheduler notes) for audit and replay.

CREATE TABLE IF NOT EXISTS admin_research_event_tape (
  id           BIGSERIAL PRIMARY KEY,
  workspace_id VARCHAR(100) NOT NULL,
  symbol       VARCHAR(40),
  market       VARCHAR(20),
  event_type   VARCHAR(60) NOT NULL,
  severity     VARCHAR(20) NOT NULL DEFAULT 'INFO',
  message      TEXT NOT NULL,
  payload      JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_research_event_tape_workspace
  ON admin_research_event_tape (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_research_event_tape_symbol
  ON admin_research_event_tape (workspace_id, symbol, created_at DESC);
