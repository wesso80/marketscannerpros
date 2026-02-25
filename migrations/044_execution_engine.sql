-- Migration 044: Execution Engine Fields
-- Adds columns to journal_entries for the execution engine pipeline.
-- All columns are nullable / have defaults — no breaking changes.

-- ── Trail & exit management ──────────────────────────────────────────
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS trail_rule          VARCHAR(30)   DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS time_stop_minutes   INTEGER       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS take_profit_2       DECIMAL(18,8),
  ADD COLUMN IF NOT EXISTS status_reason       VARCHAR(120);

-- ── Execution provenance ─────────────────────────────────────────────
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS proposal_id         UUID,
  ADD COLUMN IF NOT EXISTS execution_mode      VARCHAR(10)   DEFAULT 'DRY_RUN',
  ADD COLUMN IF NOT EXISTS broker_order_id     VARCHAR(120);

-- ── Options execution fields ─────────────────────────────────────────
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS options_dte         INTEGER,
  ADD COLUMN IF NOT EXISTS options_delta       DECIMAL(5,4),
  ADD COLUMN IF NOT EXISTS options_structure   VARCHAR(30);

-- ── Leverage / notional ──────────────────────────────────────────────
-- leverage column already exists from migration 037
-- Add max_loss_usd for options defined-risk tracking
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS max_loss_usd        DECIMAL(18,2);

-- ── Execution trade proposals table (audit trail) ────────────────────
CREATE TABLE IF NOT EXISTS execution_proposals (
  id              BIGSERIAL     PRIMARY KEY,
  workspace_id    UUID          NOT NULL,
  proposal_id     UUID          NOT NULL UNIQUE,
  intent          JSONB         NOT NULL,
  governor        JSONB         NOT NULL,
  sizing          JSONB         NOT NULL,
  exits           JSONB         NOT NULL,
  leverage_info   JSONB,
  options_info    JSONB,
  order_info      JSONB         NOT NULL,
  executable      BOOLEAN       NOT NULL DEFAULT false,
  summary         TEXT,
  validation_errors JSONB,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exec_proposals_ws
  ON execution_proposals (workspace_id, created_at DESC);

-- ── Execution results table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS execution_results (
  id                BIGSERIAL     PRIMARY KEY,
  workspace_id      UUID          NOT NULL,
  proposal_id       UUID          NOT NULL REFERENCES execution_proposals(proposal_id),
  mode              VARCHAR(10)   NOT NULL DEFAULT 'DRY_RUN',
  success           BOOLEAN       NOT NULL DEFAULT false,
  journal_entry_id  INTEGER,
  broker_order_id   VARCHAR(120),
  error_message     TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exec_results_ws
  ON execution_results (workspace_id, created_at DESC);
