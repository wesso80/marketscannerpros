-- migrations/078_admin_queue_state.sql
-- Per-symbol Admin Command Queue lifecycle state. One row per
-- (workspace, symbol, market, timeframe). Records current admin_state,
-- thesis_status, manual override audit, and packet TTL.
--
-- Boundary: research/decision-support only.

CREATE TABLE IF NOT EXISTS admin_queue_state (
  workspace_id     UUID         NOT NULL,
  symbol           VARCHAR(32)  NOT NULL,
  market           VARCHAR(16)  NOT NULL,
  timeframe        VARCHAR(8)   NOT NULL,
  -- IGNORE | WATCH | BUILDING | PRIME | TRIGGERED | CONFIRMED | PAID | EXHAUSTED | INVALIDATED
  admin_state      VARCHAR(24)  NOT NULL,
  -- alive | weakening | invalidated | reversed | stale | paid | crowded | no_edge
  thesis_status    VARCHAR(24)  NOT NULL,
  manual_override  BOOLEAN      NOT NULL DEFAULT FALSE,
  override_reason  TEXT,
  override_by      VARCHAR(64),
  state_entered_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  stale_after      TIMESTAMPTZ  NOT NULL,
  last_packet_id   VARCHAR(64),
  PRIMARY KEY (workspace_id, symbol, market, timeframe)
);

CREATE INDEX IF NOT EXISTS idx_queue_state_ws_state
  ON admin_queue_state (workspace_id, admin_state);

CREATE INDEX IF NOT EXISTS idx_queue_state_ws_stale
  ON admin_queue_state (workspace_id, stale_after);

-- Audit log for manual lifecycle overrides. Every POST to /api/admin/queue
-- writes a row here even when the new state matches the prior state.
CREATE TABLE IF NOT EXISTS admin_queue_audit (
  id               BIGSERIAL PRIMARY KEY,
  workspace_id     UUID         NOT NULL,
  symbol           VARCHAR(32)  NOT NULL,
  market           VARCHAR(16)  NOT NULL,
  timeframe        VARCHAR(8)   NOT NULL,
  prev_state       VARCHAR(24),
  next_state       VARCHAR(24)  NOT NULL,
  reason           TEXT,
  actor            VARCHAR(64),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_queue_audit_ws_time
  ON admin_queue_audit (workspace_id, created_at DESC);
