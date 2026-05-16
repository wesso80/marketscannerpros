-- migrations/079_admin_change_events.sql
-- Persistent change-event ledger for the admin layer.
--
-- Differs from admin_change_tape (077) in that this table is the
-- system-of-record for *material* deltas across ALL admin snapshots
-- (memos, scans, packets) — the change tape is a UI-facing stream,
-- this is the durable, queryable diff history used by:
--   - the "what changed since yesterday" packet section
--   - the regression detector (was bullish, now bearish)
--   - the edge ledger (which events preceded winning trades)
--
-- Boundary: research/decision-support only. Never used for execution.

CREATE TABLE IF NOT EXISTS admin_change_events (
  id               BIGSERIAL PRIMARY KEY,
  workspace_id     UUID         NOT NULL,
  scope            VARCHAR(48)  NOT NULL,   -- 'symbol' | 'sector' | 'macro' | 'portfolio' | 'regime'
  scope_key        VARCHAR(64)  NOT NULL,   -- e.g. 'AAPL', 'XLK', 'VIX_REGIME'
  field            VARCHAR(96)  NOT NULL,   -- e.g. 'opportunity_score', 'gamma_wall', 'trend'
  prev_value       JSONB,
  next_value       JSONB,
  magnitude        NUMERIC(8,2),            -- 0..100 normalised severity
  direction        VARCHAR(16),             -- 'up' | 'down' | 'flip' | 'new' | 'gone'
  reason           TEXT,                    -- human-readable summary
  packet_id        VARCHAR(64),             -- back-reference to admin_market_packets
  source_route     VARCHAR(128),            -- which admin API produced the delta
  evidence_quality NUMERIC(5,2),
  observed_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_change_events_ws_time
  ON admin_change_events (workspace_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_change_events_ws_scope_time
  ON admin_change_events (workspace_id, scope, scope_key, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_change_events_ws_field_time
  ON admin_change_events (workspace_id, field, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_change_events_packet
  ON admin_change_events (packet_id)
  WHERE packet_id IS NOT NULL;
