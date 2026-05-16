-- migrations/096_arca_meta_brain.sql
--
-- ARCA Meta-Brain — the self-improving trading intelligence layer.
--
-- This is the meta-layer that turns:
--   Data → Signal → Trade
-- into:
--   Data → Signal → Debate → Decision → Position → Outcome → Mistake Label
--        → Doctrine Update → Better Future Decision.
--
-- Admin-only. SIMULATED ONLY. No broker integration, no order routing,
-- no live execution path. Direct buy/sell/long/short language is allowed
-- because every record here describes paper decisions and post-mortem
-- analysis against simulated trades.
--
-- Hard rules enforced at schema level:
--   * workspace_id on every row (UUID, matches arca_portfolios / admin_edge_packets).
--   * Doctrine rules can only change via doctrine_reviews (CHECK on status transitions enforced in app layer).
--   * arca_trade_debates is append-only for the trader/risk/prosecutor cases
--     (rationale: a debate that produced a decision must remain auditable).
--   * arca_self_critiques and no_trade_alpha are append-only.

BEGIN;

-- ────────────────────────────────────────────────────────────────
-- 1. DOCTRINE ENGINE
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS arca_doctrine_rules (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id                UUID            NOT NULL,
  name                        TEXT            NOT NULL,
  category                    TEXT            NOT NULL,
    -- e.g. ENTRY_TIMING, EXIT_DISCIPLINE, REGIME_GUARD, SIZING, DATA_QUALITY,
    --      PLAYBOOK_SCOPE, RISK_LIMITS, BEHAVIOURAL, INFORMATION_EDGE.
  rule_text                   TEXT            NOT NULL,
  applies_to_playbooks        TEXT[]          NOT NULL DEFAULT ARRAY[]::TEXT[],
  applies_to_asset_classes    TEXT[]          NOT NULL DEFAULT ARRAY[]::TEXT[],

  status                      TEXT            NOT NULL DEFAULT 'EXPERIMENTAL'
    CHECK (status IN ('ACTIVE','UNDER_REVIEW','PROMOTED','DOWNGRADED','RETIRED','EXPERIMENTAL')),

  evidence_sample_size        INTEGER         NOT NULL DEFAULT 0,
  evidence_win_rate           NUMERIC(6,4),                -- 0..1
  evidence_average_r          NUMERIC(8,3),
  evidence_max_drawdown       NUMERIC(8,3),
  evidence_confidence         TEXT            NOT NULL DEFAULT 'low'
    CHECK (evidence_confidence IN ('low','medium','high')),

  supporting_trade_ids        UUID[]          NOT NULL DEFAULT ARRAY[]::UUID[],
  contradicting_trade_ids     UUID[]          NOT NULL DEFAULT ARRAY[]::UUID[],

  proposed_change             TEXT,                        -- pending proposed edit (set by ARCA)
  arca_reasoning              TEXT,                        -- why ARCA proposes the change

  brad_approval_required      BOOLEAN         NOT NULL DEFAULT TRUE,
  approved_by_brad            BOOLEAN         NOT NULL DEFAULT FALSE,
  approved_at                 TIMESTAMPTZ,

  created_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  last_reviewed_at            TIMESTAMPTZ,

  CONSTRAINT arca_doctrine_rules_name_chk
    CHECK (length(trim(name)) > 0 AND length(name) <= 200),
  CONSTRAINT arca_doctrine_rules_evidence_chk
    CHECK (evidence_sample_size >= 0
           AND (evidence_win_rate IS NULL OR (evidence_win_rate >= 0 AND evidence_win_rate <= 1)))
);

CREATE UNIQUE INDEX IF NOT EXISTS arca_doctrine_rules_ws_name_idx
  ON arca_doctrine_rules (workspace_id, name);
CREATE INDEX IF NOT EXISTS arca_doctrine_rules_status_idx
  ON arca_doctrine_rules (workspace_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS arca_doctrine_rules_category_idx
  ON arca_doctrine_rules (workspace_id, category, status);

COMMENT ON TABLE arca_doctrine_rules IS
  'ARCA Doctrine Engine — the system''s trading beliefs as rules. Only updated through arca_doctrine_reviews.';

CREATE TABLE IF NOT EXISTS arca_doctrine_reviews (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID            NOT NULL,
  rule_id             UUID            NOT NULL REFERENCES arca_doctrine_rules(id) ON DELETE CASCADE,

  review_type         TEXT            NOT NULL
    CHECK (review_type IN ('DAILY','WEEKLY','POST_TRADE','MANUAL')),
  finding             TEXT            NOT NULL,
  evidence_json       JSONB           NOT NULL DEFAULT '{}'::JSONB,

  proposed_action     TEXT            NOT NULL
    CHECK (proposed_action IN ('KEEP','PROMOTE','DOWNGRADE','RETIRE','MODIFY')),
  old_rule_text       TEXT,
  new_rule_text       TEXT,
  arca_reasoning      TEXT            NOT NULL,

  approved            BOOLEAN         NOT NULL DEFAULT FALSE,
  approved_by         TEXT,                                -- 'brad' | 'auto_minor'
  approved_at         TIMESTAMPTZ,
  rejected_reason     TEXT,

  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS arca_doctrine_reviews_rule_idx
  ON arca_doctrine_reviews (rule_id, created_at DESC);
CREATE INDEX IF NOT EXISTS arca_doctrine_reviews_ws_pending_idx
  ON arca_doctrine_reviews (workspace_id, approved, created_at DESC);

COMMENT ON TABLE arca_doctrine_reviews IS
  'Audit log of doctrine changes. Append-only history of every review/proposal.';

-- ────────────────────────────────────────────────────────────────
-- 2. MISTAKE TAXONOMY
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS arca_trade_mistake_labels (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID            NOT NULL,
  trade_id            UUID            NOT NULL REFERENCES arca_trades(id) ON DELETE CASCADE,
  portfolio_id        UUID            NOT NULL REFERENCES arca_portfolios(id) ON DELETE CASCADE,

  mistake_type        TEXT            NOT NULL CHECK (mistake_type IN (
    'GOOD_TRADE_BAD_OUTCOME',
    'LATE_ENTRY',
    'EARLY_ENTRY',
    'CHASING',
    'LOW_QUALITY_SETUP',
    'BAD_REGIME',
    'BAD_STOP_PLACEMENT',
    'TARGET_TOO_AMBITIOUS',
    'EXIT_TOO_EARLY',
    'HELD_TOO_LONG',
    'IGNORED_BEAR_CASE',
    'STALE_DATA_DECISION',
    'OVERLAPPED_EXPOSURE',
    'NEWS_EVENT_RISK',
    'OPTIONS_FLOW_MISREAD',
    'VOLATILITY_TRAP',
    'LIQUIDITY_SWEEP_FAILED',
    'PLAYBOOK_INVALID',
    'POSITION_TOO_LARGE',
    'BROKE_RULE',
    'NO_MISTAKE_SYSTEM_VALID'
  )),
  severity            TEXT            NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low','medium','high','critical')),

  arca_reasoning      TEXT            NOT NULL,
  evidence_json       JSONB           NOT NULL DEFAULT '{}'::JSONB,
  rule_violated_id    UUID REFERENCES arca_doctrine_rules(id) ON DELETE SET NULL,

  labeler             TEXT            NOT NULL DEFAULT 'mistake_label_engine_v1',
  labeler_version     TEXT            NOT NULL DEFAULT 'v1',
  manual_override     BOOLEAN         NOT NULL DEFAULT FALSE,
  manual_note         TEXT,

  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS arca_mistake_labels_trade_idx
  ON arca_trade_mistake_labels (trade_id, created_at DESC);
CREATE INDEX IF NOT EXISTS arca_mistake_labels_ws_type_idx
  ON arca_trade_mistake_labels (workspace_id, mistake_type, created_at DESC);
CREATE INDEX IF NOT EXISTS arca_mistake_labels_rule_idx
  ON arca_trade_mistake_labels (rule_violated_id) WHERE rule_violated_id IS NOT NULL;

COMMENT ON TABLE arca_trade_mistake_labels IS
  'Per-trade mistake classification. Every closed arca_trade should have at least one label.';

-- ────────────────────────────────────────────────────────────────
-- 3. ADVERSARIAL DEBATE
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS arca_trade_debates (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id                UUID            NOT NULL,
  portfolio_id                UUID            NOT NULL REFERENCES arca_portfolios(id) ON DELETE CASCADE,

  symbol                      TEXT            NOT NULL,
  asset_class                 TEXT            NOT NULL,
  side                        TEXT            NOT NULL CHECK (side IN ('LONG','SHORT')),
  source_edge_packet_id       TEXT,
  playbook_id                 TEXT,

  -- Trader case
  trader_case                 TEXT            NOT NULL,
  trader_confidence           NUMERIC(5,2)    NOT NULL CHECK (trader_confidence BETWEEN 0 AND 100),
  trader_evidence_json        JSONB           NOT NULL DEFAULT '{}'::JSONB,

  -- Risk officer case
  risk_case                   TEXT            NOT NULL,
  risk_blocks                 TEXT[]          NOT NULL DEFAULT ARRAY[]::TEXT[],
  risk_evidence_json          JSONB           NOT NULL DEFAULT '{}'::JSONB,

  -- Prosecutor (devil's advocate) case
  prosecutor_case             TEXT            NOT NULL,
  prosecutor_score            NUMERIC(5,2)    NOT NULL CHECK (prosecutor_score BETWEEN 0 AND 100),
    -- Higher = stronger argument AGAINST taking the trade.
  prosecutor_evidence_json    JSONB           NOT NULL DEFAULT '{}'::JSONB,

  -- Final verdict
  final_decision              TEXT            NOT NULL
    CHECK (final_decision IN ('TAKE','SKIP','SIZE_DOWN','WAIT_FOR_CONFIRMATION')),
  confidence_after_debate     NUMERIC(5,2)    NOT NULL CHECK (confidence_after_debate BETWEEN 0 AND 100),
  rejected_reason             TEXT,
  approved_size_multiplier    NUMERIC(5,3)    NOT NULL DEFAULT 1.0
    CHECK (approved_size_multiplier >= 0 AND approved_size_multiplier <= 1.5),

  information_edge_score      INTEGER         CHECK (information_edge_score IS NULL OR (information_edge_score BETWEEN 0 AND 100)),
  data_freshness_status       TEXT            NOT NULL DEFAULT 'unknown'
    CHECK (data_freshness_status IN ('fresh','delayed','stale','unknown')),

  -- Linkage to the order that was (or wasn't) created.
  resulting_order_id          UUID REFERENCES arca_simulated_orders(id) ON DELETE SET NULL,

  decided_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  created_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS arca_trade_debates_ws_symbol_idx
  ON arca_trade_debates (workspace_id, symbol, decided_at DESC);
CREATE INDEX IF NOT EXISTS arca_trade_debates_ws_decision_idx
  ON arca_trade_debates (workspace_id, final_decision, decided_at DESC);
CREATE INDEX IF NOT EXISTS arca_trade_debates_order_idx
  ON arca_trade_debates (resulting_order_id) WHERE resulting_order_id IS NOT NULL;

COMMENT ON TABLE arca_trade_debates IS
  'Adversarial debate record. NO simulated order may be created without a corresponding debate row.';

-- ────────────────────────────────────────────────────────────────
-- 4. CAPITAL ALLOCATION
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS arca_capital_allocation_decisions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id                UUID            NOT NULL,
  portfolio_id                UUID            NOT NULL REFERENCES arca_portfolios(id) ON DELETE CASCADE,
  debate_id                   UUID REFERENCES arca_trade_debates(id) ON DELETE SET NULL,

  symbol                      TEXT            NOT NULL,
  playbook_id                 TEXT,

  grade                       TEXT            NOT NULL
    CHECK (grade IN ('A_GRADE','B_GRADE','C_GRADE','EXPERIMENTAL','NO_TRADE')),
  risk_percent                NUMERIC(5,3)    NOT NULL CHECK (risk_percent >= 0 AND risk_percent <= 5),
  max_loss_dollars            NUMERIC(16,2)   NOT NULL CHECK (max_loss_dollars >= 0),

  -- Allocation inputs (snapshot at decision time)
  playbook_expectancy         NUMERIC(8,4),
  regime_quality              NUMERIC(5,2),
  data_freshness              TEXT,
  confidence                  NUMERIC(5,2),
  information_edge_score      INTEGER         CHECK (information_edge_score IS NULL OR (information_edge_score BETWEEN 0 AND 100)),
  personal_fit_score          NUMERIC(5,2),
  drawdown_state              TEXT,
  correlation_exposure        NUMERIC(5,2),
  event_risk                  TEXT,
  recent_mistake_frequency    INTEGER         NOT NULL DEFAULT 0,

  allocation_reason           TEXT            NOT NULL,
  size_adjustment_reason      TEXT,

  created_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS arca_capital_alloc_ws_idx
  ON arca_capital_allocation_decisions (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS arca_capital_alloc_debate_idx
  ON arca_capital_allocation_decisions (debate_id) WHERE debate_id IS NOT NULL;

COMMENT ON TABLE arca_capital_allocation_decisions IS
  'Capital allocation decisions. Snapshots all inputs at decision time for later calibration.';

-- ────────────────────────────────────────────────────────────────
-- 5. REGIME-PLAYBOOK MATRIX
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS arca_regime_playbook_matrix (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id                UUID            NOT NULL,

  regime                      TEXT            NOT NULL,
    -- e.g. RISK_ON_TREND, RISK_OFF_STRESS, HIGH_VOL_CHOP, LOW_VOL_DRIFT,
    --      MEAN_REVERTING, TRANSITION, VOL_EXPANSION.
  enabled_playbooks           TEXT[]          NOT NULL DEFAULT ARRAY[]::TEXT[],
  reduced_size_playbooks      TEXT[]          NOT NULL DEFAULT ARRAY[]::TEXT[],
  disabled_playbooks          TEXT[]          NOT NULL DEFAULT ARRAY[]::TEXT[],

  preferred_asset_classes     TEXT[]          NOT NULL DEFAULT ARRAY[]::TEXT[],
  avoided_asset_classes       TEXT[]          NOT NULL DEFAULT ARRAY[]::TEXT[],

  required_confirmations      TEXT[]          NOT NULL DEFAULT ARRAY[]::TEXT[],
  notes                       TEXT,

  updated_by                  TEXT            NOT NULL DEFAULT 'admin',
  created_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS arca_regime_matrix_ws_regime_idx
  ON arca_regime_playbook_matrix (workspace_id, regime);

COMMENT ON TABLE arca_regime_playbook_matrix IS
  'Per-regime playbook permissions. Opportunity Queue checks this before ranking.';

-- ────────────────────────────────────────────────────────────────
-- 6. INFORMATION EDGE SCORES (snapshot per packet evaluation)
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS arca_information_edge_scores (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id                UUID            NOT NULL,

  packet_id                   TEXT            NOT NULL,
  symbol                      TEXT            NOT NULL,
  playbook_id                 TEXT,

  -- Inputs (0..100 each)
  uniqueness                  INTEGER         NOT NULL CHECK (uniqueness BETWEEN 0 AND 100),
  earliness                   INTEGER         NOT NULL CHECK (earliness BETWEEN 0 AND 100),
  crowding_risk               INTEGER         NOT NULL CHECK (crowding_risk BETWEEN 0 AND 100),
  obviousness                 INTEGER         NOT NULL CHECK (obviousness BETWEEN 0 AND 100),
  hidden_pressure             INTEGER         NOT NULL CHECK (hidden_pressure BETWEEN 0 AND 100),
  reward_remaining            INTEGER         NOT NULL CHECK (reward_remaining BETWEEN 0 AND 100),
  signal_rarity               INTEGER         NOT NULL CHECK (signal_rarity BETWEEN 0 AND 100),
  cross_asset_confirmation    INTEGER         NOT NULL CHECK (cross_asset_confirmation BETWEEN 0 AND 100),
  personal_historical_edge    INTEGER         NOT NULL CHECK (personal_historical_edge BETWEEN 0 AND 100),

  score                       INTEGER         NOT NULL CHECK (score BETWEEN 0 AND 100),
  band                        TEXT            NOT NULL
    CHECK (band IN ('OBVIOUS_NOISE','MODERATE','STRONG','RARE_ASYMMETRIC')),

  reasoning                   TEXT            NOT NULL,
  weights_version             TEXT            NOT NULL DEFAULT 'v1',

  created_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS arca_info_edge_ws_packet_idx
  ON arca_information_edge_scores (workspace_id, packet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS arca_info_edge_ws_symbol_idx
  ON arca_information_edge_scores (workspace_id, symbol, created_at DESC);
CREATE INDEX IF NOT EXISTS arca_info_edge_band_idx
  ON arca_information_edge_scores (workspace_id, band, created_at DESC);

COMMENT ON TABLE arca_information_edge_scores IS
  'Information Edge Score per packet evaluation. Distinct from confidence — measures non-obviousness.';

-- ────────────────────────────────────────────────────────────────
-- 7. REGRET MAP
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS arca_regret_map_entries (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id                UUID            NOT NULL,

  symbol                      TEXT            NOT NULL,
  observed_at                 TIMESTAMPTZ     NOT NULL,

  classification              TEXT            NOT NULL CHECK (classification IN (
    'ARCA_TAKEN_BRAD_SKIPPED',
    'BRAD_TAKEN_ARCA_REJECTED',
    'BOTH_TAKEN',
    'BOTH_SKIPPED_WINNER',
    'BOTH_AVOIDED_LOSER',
    'ARCA_TAKEN_FAILED',
    'BRAD_TAKEN_FAILED',
    'ARCA_REJECTED_CORRECTLY',
    'BRAD_DISCRETION_BEAT_ARCA'
  )),

  arca_trade_id               UUID REFERENCES arca_trades(id) ON DELETE SET NULL,
  brad_journal_entry_id       TEXT,                                -- references journal_entries.id (TEXT pk in that schema)
  source_edge_packet_id       TEXT,
  playbook_id                 TEXT,

  missed_r                    NUMERIC(8,3),    -- positive = missed gain
  avoided_r_loss              NUMERIC(8,3),    -- positive = saved loss
  regret_cost_dollars         NUMERIC(16,2),
  correct_avoidance_value     NUMERIC(16,2),

  arca_reasoning              TEXT            NOT NULL,
  evidence_json               JSONB           NOT NULL DEFAULT '{}'::JSONB,

  created_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS arca_regret_ws_classification_idx
  ON arca_regret_map_entries (workspace_id, classification, observed_at DESC);
CREATE INDEX IF NOT EXISTS arca_regret_ws_symbol_idx
  ON arca_regret_map_entries (workspace_id, symbol, observed_at DESC);

COMMENT ON TABLE arca_regret_map_entries IS
  'Comparative outcome ledger: ARCA vs Brad vs benchmark. Powers /admin/regret-map.';

-- ────────────────────────────────────────────────────────────────
-- 8. NO-TRADE ALPHA
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS arca_no_trade_alpha (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id                UUID            NOT NULL,

  symbol                      TEXT            NOT NULL,
  rejected_at                 TIMESTAMPTZ     NOT NULL,
  rejection_source            TEXT            NOT NULL
    CHECK (rejection_source IN ('DEBATE','DOCTRINE','REGIME_MATRIX','CAP_ALLOC','DATA_QUALITY','MANUAL')),
  debate_id                   UUID REFERENCES arca_trade_debates(id) ON DELETE SET NULL,
  rejection_reason            TEXT            NOT NULL,

  hypothetical_entry          NUMERIC(18,8),
  hypothetical_stop           NUMERIC(18,8),
  hypothetical_target         NUMERIC(18,8),
  hypothetical_size_dollars   NUMERIC(16,2),

  outcome_evaluated_at        TIMESTAMPTZ,
  outcome_class               TEXT            CHECK (outcome_class IN (
    'AVOIDED_LOSS','MISSED_WIN','CORRECT_REJECTION','INCORRECT_REJECTION','UNRESOLVED'
  )),
  realised_r_if_taken         NUMERIC(8,3),
  realised_pnl_if_taken       NUMERIC(16,2),
  evaluator_version           TEXT            NOT NULL DEFAULT 'v1',

  created_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS arca_no_trade_ws_outcome_idx
  ON arca_no_trade_alpha (workspace_id, outcome_class, rejected_at DESC);
CREATE INDEX IF NOT EXISTS arca_no_trade_ws_symbol_idx
  ON arca_no_trade_alpha (workspace_id, symbol, rejected_at DESC);
CREATE INDEX IF NOT EXISTS arca_no_trade_pending_idx
  ON arca_no_trade_alpha (workspace_id, rejected_at)
  WHERE outcome_class IS NULL;

COMMENT ON TABLE arca_no_trade_alpha IS
  'Tracks the value of inaction. Append a row per rejected setup; cron later evaluates the hypothetical outcome.';

-- ────────────────────────────────────────────────────────────────
-- 9. SYSTEM SELF-CRITIQUE
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS arca_self_critiques (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id                UUID            NOT NULL,
  portfolio_id                UUID REFERENCES arca_portfolios(id) ON DELETE SET NULL,

  report_kind                 TEXT            NOT NULL
    CHECK (report_kind IN ('DAILY','EVENING','WEEKLY','POST_MORTEM','MANUAL')),
  period_start                TIMESTAMPTZ     NOT NULL,
  period_end                  TIMESTAMPTZ     NOT NULL,

  most_overconfident_bad_call JSONB,
  best_rejected_trade         JSONB,
  worst_accepted_trade        JSONB,
  most_useful_data_source     TEXT,
  least_useful_data_source    TEXT,
  rule_to_promote_id          UUID REFERENCES arca_doctrine_rules(id) ON DELETE SET NULL,
  rule_to_downgrade_id        UUID REFERENCES arca_doctrine_rules(id) ON DELETE SET NULL,
  setup_to_ban_next_week      TEXT,
  setup_to_increase_next_week TEXT,
  behavioural_warning         TEXT,
  data_quality_warning        TEXT,

  full_report_json            JSONB           NOT NULL DEFAULT '{}'::JSONB,
  engine_version              TEXT            NOT NULL DEFAULT 'v1',

  created_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  CONSTRAINT arca_self_critiques_period_chk CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS arca_self_critiques_ws_kind_idx
  ON arca_self_critiques (workspace_id, report_kind, period_end DESC);

COMMENT ON TABLE arca_self_critiques IS
  'System self-critique reports. Append-only. One row per report run.';

-- ────────────────────────────────────────────────────────────────
-- Triggers — keep updated_at consistent + enforce append-only where applicable
-- ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION arca_brain_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION arca_brain_block_modify_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only; % is not allowed', TG_TABLE_NAME, TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_arca_doctrine_rules_updated_at ON arca_doctrine_rules;
CREATE TRIGGER trg_arca_doctrine_rules_updated_at
BEFORE UPDATE ON arca_doctrine_rules
FOR EACH ROW
EXECUTE FUNCTION arca_brain_set_updated_at();

DROP TRIGGER IF EXISTS trg_arca_regime_matrix_updated_at ON arca_regime_playbook_matrix;
CREATE TRIGGER trg_arca_regime_matrix_updated_at
BEFORE UPDATE ON arca_regime_playbook_matrix
FOR EACH ROW
EXECUTE FUNCTION arca_brain_set_updated_at();

-- Append-only enforcement on audit / outcome tables.
DROP TRIGGER IF EXISTS trg_arca_doctrine_reviews_block_ud ON arca_doctrine_reviews;
CREATE TRIGGER trg_arca_doctrine_reviews_block_ud
BEFORE DELETE ON arca_doctrine_reviews
FOR EACH ROW
EXECUTE FUNCTION arca_brain_block_modify_append_only();
-- Allow UPDATE on doctrine_reviews ONLY to flip approved/approved_by/approved_at/rejected_reason.
-- (Not enforced at trigger level — app layer responsibility; would require row-level rule.)

DROP TRIGGER IF EXISTS trg_arca_self_critiques_block_ud ON arca_self_critiques;
CREATE TRIGGER trg_arca_self_critiques_block_ud
BEFORE UPDATE OR DELETE ON arca_self_critiques
FOR EACH ROW
EXECUTE FUNCTION arca_brain_block_modify_append_only();

DROP TRIGGER IF EXISTS trg_arca_information_edge_block_ud ON arca_information_edge_scores;
CREATE TRIGGER trg_arca_information_edge_block_ud
BEFORE UPDATE OR DELETE ON arca_information_edge_scores
FOR EACH ROW
EXECUTE FUNCTION arca_brain_block_modify_append_only();

-- Note: arca_trade_debates is NOT trigger-blocked. The decided_at/resulting_order_id
-- can be linked AFTER the order is created. App layer must never modify the *_case
-- text fields. A future migration may enforce that with a stricter trigger.

-- ────────────────────────────────────────────────────────────────
-- Seed — default regime-playbook matrix and starter doctrine rules.
-- Workspace 'admin' (see hashWorkspaceId('admin_secret')) is the default operator.
-- Seeds are idempotent.
-- ────────────────────────────────────────────────────────────────

-- Resolve admin workspace_id via stable hash. We seed nothing here that
-- references a workspace_id — initial seeding is done at app startup by
-- lib/admin/arca-brain/seed.ts so we don't hardcode UUIDs.

-- ────────────────────────────────────────────────────────────────
-- Link existing ARCA tables to the meta-brain.
-- ────────────────────────────────────────────────────────────────

ALTER TABLE arca_simulated_orders
  ADD COLUMN IF NOT EXISTS debate_id UUID
  REFERENCES arca_trade_debates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS arca_simulated_orders_debate_idx
  ON arca_simulated_orders (debate_id) WHERE debate_id IS NOT NULL;

COMMENT ON COLUMN arca_simulated_orders.debate_id IS
  'Adversarial debate row that authorised this simulated order. NULL only for legacy rows or operator-forced entries.';

COMMIT;
