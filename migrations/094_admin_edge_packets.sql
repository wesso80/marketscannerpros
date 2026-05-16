-- migrations/094_admin_edge_packets.sql
--
-- Persistence for the canonical AdminEdgePacket emitted by the
-- Opportunity Board on every admin scan. Stores one row per
-- (workspace, symbol, market, timeframe, generated_at) with the full
-- packet JSON so we can:
--   - audit historical ranking and lifecycle transitions
--   - calibrate opportunityRankScore against edge_ledger_outcomes
--   - reconstruct "what the board showed at decision time" for any
--     READY -> action latency review (Tier 1 #5)
--
-- Indexed for the common access patterns:
--   * latest packet per symbol  -> (workspace_id, symbol, market, timeframe, generated_at DESC)
--   * recent activity window    -> (workspace_id, generated_at DESC)
--   * rank-distribution queries -> (workspace_id, opportunity_rank_score DESC)
--
-- Retention: 30-day rolling window enforced by the evening packet cron.

CREATE TABLE IF NOT EXISTS admin_edge_packets (
  id                       BIGSERIAL PRIMARY KEY,
  workspace_id             UUID         NOT NULL,
  packet_id                TEXT         NOT NULL,
  symbol                   TEXT         NOT NULL,
  market                   TEXT         NOT NULL,
  timeframe                TEXT         NOT NULL,
  asset_class              TEXT         NOT NULL,
  opportunity_rank         INTEGER      NOT NULL DEFAULT 0,
  opportunity_rank_score   NUMERIC(6,2) NOT NULL DEFAULT 0,
  admin_state              TEXT         NOT NULL,
  thesis_status            TEXT         NOT NULL,
  setup_type               TEXT         NOT NULL,
  bias                     TEXT         NOT NULL,
  trust_adjusted_score     NUMERIC(6,2) NOT NULL DEFAULT 0,
  evidence_quality_score   NUMERIC(6,2) NOT NULL DEFAULT 0,
  trap_risk_score          NUMERIC(6,2) NOT NULL DEFAULT 0,
  freshness                TEXT         NOT NULL,
  simulated                BOOLEAN      NOT NULL DEFAULT FALSE,
  do_nothing               BOOLEAN      NOT NULL DEFAULT FALSE,
  scheduler_run_id         TEXT,
  packet_json              JSONB        NOT NULL,
  generated_at             TIMESTAMPTZ  NOT NULL,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_edge_packets_symbol_idx
  ON admin_edge_packets (workspace_id, symbol, market, timeframe, generated_at DESC);

CREATE INDEX IF NOT EXISTS admin_edge_packets_recent_idx
  ON admin_edge_packets (workspace_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS admin_edge_packets_rank_idx
  ON admin_edge_packets (workspace_id, opportunity_rank_score DESC, generated_at DESC);

CREATE INDEX IF NOT EXISTS admin_edge_packets_packet_id_idx
  ON admin_edge_packets (packet_id);
