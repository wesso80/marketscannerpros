-- =====================================================
-- 023_decision_packets_lifecycle.sql
-- Purpose: Canonical Decision Packet persistence + idempotent dedupe aliases
-- Safe to run multiple times (idempotent)
-- =====================================================

CREATE TABLE IF NOT EXISTS decision_packets (
  workspace_id VARCHAR(100) NOT NULL,
  packet_id VARCHAR(160) NOT NULL,
  fingerprint VARCHAR(64) NOT NULL,
  symbol VARCHAR(24) NOT NULL,
  market VARCHAR(20),
  signal_source VARCHAR(120),
  signal_score NUMERIC(8,3),
  bias VARCHAR(16),
  timeframe_bias JSONB NOT NULL DEFAULT '[]'::jsonb,
  entry_zone NUMERIC(20,8),
  invalidation NUMERIC(20,8),
  targets JSONB,
  risk_score NUMERIC(8,3),
  volatility_regime VARCHAR(60),
  operator_fit NUMERIC(8,3),
  status VARCHAR(20) NOT NULL DEFAULT 'candidate',
  workflow_id VARCHAR(160),
  first_event_id VARCHAR(180),
  candidate_event_id VARCHAR(180),
  planned_event_id VARCHAR(180),
  alerted_event_id VARCHAR(180),
  executed_event_id VARCHAR(180),
  closed_event_id VARCHAR(180),
  last_event_id VARCHAR(180),
  last_event_type VARCHAR(80),
  source_event_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, packet_id),
  CONSTRAINT decision_packets_status_check CHECK (status IN ('candidate', 'planned', 'alerted', 'executed', 'closed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_decision_packets_workspace_fingerprint
  ON decision_packets (workspace_id, fingerprint);

CREATE INDEX IF NOT EXISTS idx_decision_packets_workspace_status_updated
  ON decision_packets (workspace_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_decision_packets_workspace_symbol_updated
  ON decision_packets (workspace_id, symbol, updated_at DESC);

CREATE TABLE IF NOT EXISTS decision_packet_aliases (
  workspace_id VARCHAR(100) NOT NULL,
  alias_id VARCHAR(160) NOT NULL,
  packet_id VARCHAR(160) NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, alias_id),
  FOREIGN KEY (workspace_id, packet_id)
    REFERENCES decision_packets(workspace_id, packet_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_decision_packet_aliases_workspace_packet
  ON decision_packet_aliases (workspace_id, packet_id);