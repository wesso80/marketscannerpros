-- 029_asset_class_columns.sql
-- Backfill schema for mixed-asset journaling and packet matching

ALTER TABLE IF EXISTS journal_entries
  ADD COLUMN IF NOT EXISTS asset_class VARCHAR(20);

ALTER TABLE IF EXISTS decision_packets
  ADD COLUMN IF NOT EXISTS asset_class VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_decision_packets_workspace_symbol_asset_class_updated
  ON decision_packets (workspace_id, symbol, asset_class, updated_at DESC);
