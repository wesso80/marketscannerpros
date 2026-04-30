-- 071_admin_research_packet_snapshots.sql
-- Phase 10: Server-side packet history for research delta computation

CREATE TABLE IF NOT EXISTS admin_research_packet_snapshots (
  id BIGSERIAL PRIMARY KEY,
  workspace_id VARCHAR(100) NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  market VARCHAR(20) NOT NULL,
  timeframe VARCHAR(20) NOT NULL,
  asset_class VARCHAR(20) NOT NULL,
  
  -- Packet content (full JSON snapshot)
  packet_json JSONB NOT NULL,
  
  -- Indexable score fields for quick lookups
  raw_research_score NUMERIC(5,2),
  trust_adjusted_score NUMERIC(5,2),
  lifecycle VARCHAR(40),
  data_trust_status VARCHAR(40),
  
  -- Context for event correlation
  scheduler_run_id VARCHAR(120),
  scan_mode VARCHAR(40),
  
  -- Audit trail
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ -- optional TTL for auto-cleanup (e.g., 90 days)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_admin_packet_snapshots_symbol_recent 
  ON admin_research_packet_snapshots (workspace_id, symbol, market, timeframe, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_packet_snapshots_lifecycle
  ON admin_research_packet_snapshots (workspace_id, lifecycle, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_packet_snapshots_run
  ON admin_research_packet_snapshots (scheduler_run_id, created_at DESC);
