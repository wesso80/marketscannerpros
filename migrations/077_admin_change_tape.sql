-- migrations/077_admin_change_tape.sql
-- Workspace-scoped admin change tape. Records every meaningful delta
-- produced by the change detection layer so the admin home can render
-- a live "what changed since last scan" stream.
--
-- Boundary: research/decision-support only. Not used for trade execution.

CREATE TABLE IF NOT EXISTS admin_change_tape (
  id               BIGSERIAL PRIMARY KEY,
  workspace_id     UUID         NOT NULL,
  symbol           VARCHAR(32)  NOT NULL,
  market           VARCHAR(16)  NOT NULL,
  timeframe        VARCHAR(8)   NOT NULL,
  -- 'GAMMA_FLIP' | 'UOA_SPIKE' | 'STRUCTURE_BREAK' | 'RECLAIM'
  -- 'LIFECYCLE' | 'INVALIDATION' | 'ARCA_VERDICT' | 'SCORE_JUMP'
  -- 'TIME_CLUSTER' | 'VOLATILITY_REGIME' | 'TRAP_FIRED'
  event_type       VARCHAR(48)  NOT NULL,
  prev_value       JSONB,
  next_value       JSONB,
  magnitude        NUMERIC(8,2),     -- 0..100 normalized severity
  packet_id        VARCHAR(64),
  source           VARCHAR(48)  NOT NULL,
  evidence_quality NUMERIC(5,2),     -- snapshot of EvidenceQualityScore
  observed_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_change_tape_ws_time
  ON admin_change_tape (workspace_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_change_tape_ws_sym_time
  ON admin_change_tape (workspace_id, symbol, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_change_tape_ws_type_time
  ON admin_change_tape (workspace_id, event_type, observed_at DESC);
