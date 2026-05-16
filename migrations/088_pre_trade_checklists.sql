-- migrations/088_pre_trade_checklists.sql
-- Pre-Trade Checklist runs — each time the operator considers taking a setup,
-- the system gates it through a standard checklist. Overrides are logged
-- to the edge_ledger_self_attribution table for behavioral drift detection.

CREATE TABLE IF NOT EXISTS pre_trade_checklists (
  id                BIGSERIAL PRIMARY KEY,
  workspace_id      UUID         NOT NULL,
  setup_id          BIGINT       REFERENCES edge_ledger_setups(id) ON DELETE SET NULL,
  symbol            VARCHAR(20)  NOT NULL,
  playbook          VARCHAR(64),

  -- Checklist gate outcomes (NULL = not evaluated)
  gate_regime         BOOLEAN,
  gate_evidence       BOOLEAN,
  gate_exposure       BOOLEAN,
  gate_news_blackout  BOOLEAN,
  gate_data_freshness BOOLEAN,
  gate_iv_bias        BOOLEAN,
  gate_personal_cap   BOOLEAN,

  -- Recommendation
  recommendation    VARCHAR(16)  NOT NULL,         -- 'go' | 'caution' | 'no-go'
  blocking_gates    TEXT[],                        -- list of gate keys that failed
  warning_gates     TEXT[],                        -- gates that warned but did not block
  rationale         TEXT,

  -- Operator decision
  operator_action   VARCHAR(16),                   -- 'taken' | 'skipped' | 'pending'
  operator_overrode BOOLEAN      NOT NULL DEFAULT FALSE,
  override_reason   TEXT,

  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pre_trade_ws_time
  ON pre_trade_checklists (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pre_trade_ws_symbol
  ON pre_trade_checklists (workspace_id, symbol, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pre_trade_ws_rec
  ON pre_trade_checklists (workspace_id, recommendation, created_at DESC);
