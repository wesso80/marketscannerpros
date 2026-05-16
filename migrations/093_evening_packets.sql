-- migrations/093_evening_packets.sql
--
-- Persistence for the nightly Evening Reconciliation Packet (see
-- lib/eveningPacket/builder.ts and /api/cron/evening-packet). Stores
-- one row per (workspace, day) with the full packet JSON for audit
-- and historical comparison. Idempotent upsert keyed on
-- (workspace_id, date_iso).

CREATE TABLE IF NOT EXISTS evening_packets (
  id            BIGSERIAL PRIMARY KEY,
  workspace_id  UUID        NOT NULL,
  date_iso      DATE        NOT NULL,
  packet_json   JSONB       NOT NULL,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT evening_packets_workspace_date_uk UNIQUE (workspace_id, date_iso)
);

CREATE INDEX IF NOT EXISTS evening_packets_workspace_date_idx
  ON evening_packets (workspace_id, date_iso DESC);
