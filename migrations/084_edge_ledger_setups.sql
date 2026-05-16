-- migrations/084_edge_ledger_setups.sql
-- Edge Ledger — every setup the system surfaced (taken OR skipped),
-- with the full context that existed at decision time.
--
-- This is THE foundation of the platform's personal alpha graph.
-- Outcomes (085) and self-attribution (086) ride on top.
--
-- Boundary: research/decision-support only. No broker execution.

CREATE TABLE IF NOT EXISTS edge_ledger_setups (
  id                BIGSERIAL PRIMARY KEY,
  workspace_id      UUID         NOT NULL,
  setup_key         VARCHAR(64)  NOT NULL,           -- deterministic hash for dedup within a day
  symbol            VARCHAR(20)  NOT NULL,
  market            VARCHAR(16)  NOT NULL,           -- 'equity' | 'crypto' | 'options' | 'futures'

  -- Setup classification
  playbook          VARCHAR(64),                     -- e.g. 'vwap-reclaim', 'squeeze-break'
  setup_type        VARCHAR(48)  NOT NULL,           -- 'breakout' | 'reversal' | 'continuation' | 'fade' | 'mean-revert' | 'event-driven'
  direction         VARCHAR(8)   NOT NULL,           -- 'long' | 'short'

  -- Context at decision time (immutable snapshot)
  packet_id         VARCHAR(64),                     -- back-ref to admin_market_packets
  regime            VARCHAR(32),                     -- 'trend-up' | 'trend-down' | 'chop' | 'vol-expand' | 'vol-contract' | 'risk-off'
  vix_level         NUMERIC(8,2),
  iv_percentile     NUMERIC(6,2),
  sector            VARCHAR(64),
  catalyst_proximity_days INT,                       -- days to next known catalyst (earnings, fed, etc.)
  evidence_quality  NUMERIC(5,2),
  opportunity_score NUMERIC(5,2),
  confidence        VARCHAR(8),                      -- 'high' | 'medium' | 'low'

  -- Entry / stop / targets the system suggested
  entry_price       NUMERIC(18,8),
  stop_price        NUMERIC(18,8),
  target_price      NUMERIC(18,8),
  risk_per_share    NUMERIC(18,8),
  reward_risk       NUMERIC(8,3),

  -- Decision
  status            VARCHAR(16)  NOT NULL DEFAULT 'surfaced',  -- 'surfaced' | 'taken' | 'skipped' | 'invalidated'
  taken_at          TIMESTAMPTZ,
  skipped_reason    TEXT,

  -- Raw feature vector (for analogue search later)
  feature_vector    JSONB,

  surfaced_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, setup_key)
);

CREATE INDEX IF NOT EXISTS idx_edge_setups_ws_time
  ON edge_ledger_setups (workspace_id, surfaced_at DESC);

CREATE INDEX IF NOT EXISTS idx_edge_setups_ws_symbol_time
  ON edge_ledger_setups (workspace_id, symbol, surfaced_at DESC);

CREATE INDEX IF NOT EXISTS idx_edge_setups_ws_playbook_time
  ON edge_ledger_setups (workspace_id, playbook, surfaced_at DESC);

CREATE INDEX IF NOT EXISTS idx_edge_setups_ws_status
  ON edge_ledger_setups (workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_edge_setups_ws_regime
  ON edge_ledger_setups (workspace_id, regime, surfaced_at DESC);
