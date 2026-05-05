-- 073_brain_layer.sql
-- Phase 2 — Elite Brain Architecture
-- Unifies event capture, feature snapshots, outcome labels, and edge scores.
-- Designed as an additive layer above existing engines (signals_fired,
-- trade_outcomes, signal_outcomes, etc.) — does NOT replace them.
--
-- Hard rules enforced at schema level:
--   * Every row carries workspace_id (multi-tenant isolation).
--   * Features are frozen at event time (snapshot_hash + as_of_ts).
--   * Outcomes carry resolved_at_ts >= as_of_ts (look-ahead guard).
--   * Provenance fields are NOT NULL where they protect us legally
--     (model_version, rule_version, source, freshness).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Layer 1 — Raw event capture
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_events (
  event_id              UUID PRIMARY KEY,
  workspace_id          VARCHAR(100) NOT NULL,
  symbol                VARCHAR(40),
  asset_class           VARCHAR(20),
  timeframe             VARCHAR(20),
  event_type            VARCHAR(60) NOT NULL,
  ts                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Provenance
  source                VARCHAR(60)  NOT NULL,
  data_freshness        VARCHAR(20)  NOT NULL DEFAULT 'unknown',  -- real-time | delayed | stale | unknown | simulated
  input_snapshot_hash   VARCHAR(64),                              -- sha256 of inputs used
  score_snapshot        JSONB        NOT NULL DEFAULT '{}'::jsonb,
  model_version         VARCHAR(40)  NOT NULL DEFAULT 'unversioned',
  prompt_version        VARCHAR(40),
  rule_version          VARCHAR(40)  NOT NULL DEFAULT 'unversioned',

  -- Visibility flags (admin/public separation)
  admin_only            BOOLEAN      NOT NULL DEFAULT FALSE,
  public_safe           BOOLEAN      NOT NULL DEFAULT FALSE,

  -- Optional cross-references
  signal_id             BIGINT,        -- → signals_fired.id when applicable
  ai_signal_log_id      BIGINT,        -- → ai_signal_log.id when admin-side
  journal_entry_id      BIGINT,        -- → journal_entries.id when applicable
  decision_packet_id    VARCHAR(120),  -- → decision_packets.packet_id

  -- Free-form payload (must be small; large blobs go in score_snapshot or
  -- referenced rows). Used for event-type-specific fields.
  meta                  JSONB        NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT brain_events_visibility_xor
    CHECK (NOT (admin_only AND public_safe))
);

CREATE INDEX IF NOT EXISTS brain_events_ws_ts_idx
  ON brain_events (workspace_id, ts DESC);
CREATE INDEX IF NOT EXISTS brain_events_type_ts_idx
  ON brain_events (event_type, ts DESC);
CREATE INDEX IF NOT EXISTS brain_events_symbol_ts_idx
  ON brain_events (symbol, ts DESC) WHERE symbol IS NOT NULL;
CREATE INDEX IF NOT EXISTS brain_events_signal_idx
  ON brain_events (signal_id) WHERE signal_id IS NOT NULL;

COMMENT ON TABLE brain_events IS
  'Phase 2 unified event log. Every meaningful platform event lands here with provenance.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Layer 2 — Feature store (snapshot at event time, immutable)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_features (
  feature_id            UUID PRIMARY KEY,
  event_id              UUID NOT NULL REFERENCES brain_events(event_id) ON DELETE CASCADE,
  workspace_id          VARCHAR(100) NOT NULL,
  symbol                VARCHAR(40)  NOT NULL,
  asset_class           VARCHAR(20)  NOT NULL,
  timeframe             VARCHAR(20)  NOT NULL,
  as_of_ts              TIMESTAMPTZ  NOT NULL,                    -- moment features were valid for
  ingested_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- Snapshot integrity
  snapshot_hash         VARCHAR(64)  NOT NULL,                    -- sha256(features_json) — detects mutation
  feature_schema_version VARCHAR(20) NOT NULL DEFAULT 'v1',

  -- Bucketed feature blobs (kept structured for indexing/ML, but free-form
  -- inside each bucket so engines can evolve without schema churn).
  market_structure      JSONB NOT NULL DEFAULT '{}'::jsonb,
  volatility            JSONB NOT NULL DEFAULT '{}'::jsonb,
  volume_liquidity      JSONB NOT NULL DEFAULT '{}'::jsonb,
  options               JSONB NOT NULL DEFAULT '{}'::jsonb,
  derivatives           JSONB NOT NULL DEFAULT '{}'::jsonb,
  time_context          JSONB NOT NULL DEFAULT '{}'::jsonb,
  macro_context         JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_evidence           JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Quality flags (reduces edge confidence downstream — never silently filled)
  missing_data_count    INTEGER NOT NULL DEFAULT 0,
  stale_data_count      INTEGER NOT NULL DEFAULT 0,
  simulated_field_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS brain_features_ws_symbol_idx
  ON brain_features (workspace_id, symbol, as_of_ts DESC);
CREATE INDEX IF NOT EXISTS brain_features_event_idx
  ON brain_features (event_id);

COMMENT ON TABLE brain_features IS
  'Phase 2 feature store. Frozen at event time. snapshot_hash detects mutation. Never UPDATE rows.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Layer 3 — Outcome labels (resolved AFTER as_of_ts; look-ahead guard enforced)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_outcomes (
  outcome_id            UUID PRIMARY KEY,
  event_id              UUID NOT NULL REFERENCES brain_events(event_id) ON DELETE CASCADE,
  workspace_id          VARCHAR(100) NOT NULL,
  symbol                VARCHAR(40)  NOT NULL,
  horizon               VARCHAR(20)  NOT NULL,                    -- '1h'|'4h'|'1d'|'3d'|'1w'|'custom'
  horizon_seconds       INTEGER      NOT NULL,                    -- machine-readable horizon

  as_of_ts              TIMESTAMPTZ  NOT NULL,                    -- copy of event as_of for guard checks
  resolved_at_ts        TIMESTAMPTZ  NOT NULL,                    -- when label was computed (must be >= as_of_ts + horizon)
  data_through_ts       TIMESTAMPTZ  NOT NULL,                    -- last bar timestamp consumed (must be > as_of_ts)

  -- Outcome metrics
  mfe_pct               NUMERIC(10,4),                            -- max favourable excursion %
  mae_pct               NUMERIC(10,4),                            -- max adverse excursion %
  mfe_r                 NUMERIC(10,4),                            -- MFE in R-multiples (if entry/stop known)
  mae_r                 NUMERIC(10,4),
  time_to_move_secs     INTEGER,                                  -- seconds to first 1R move
  invalidation_touched  BOOLEAN,
  key_level_touched     BOOLEAN,
  reaction_zone_touched BOOLEAN,
  vol_expansion_occurred BOOLEAN,

  -- Categorical outcome
  outcome_class         VARCHAR(40) NOT NULL,                     -- failed_before_confirm | confirmed_then_failed | confirmed_followed_through | no_resolution | insufficient_data
  resolution_reason     TEXT,

  -- Quality
  bars_consumed         INTEGER NOT NULL DEFAULT 0,
  data_source           VARCHAR(60),                              -- alpha-vantage | coingecko | polygon | etc.
  data_quality          VARCHAR(20)  NOT NULL DEFAULT 'unknown',  -- clean | partial | gap | unknown

  -- Look-ahead guard: enforced at INSERT time
  CONSTRAINT brain_outcomes_no_lookahead
    CHECK (resolved_at_ts >= as_of_ts AND data_through_ts > as_of_ts),
  CONSTRAINT brain_outcomes_horizon_respected
    CHECK (data_through_ts >= as_of_ts + (horizon_seconds || ' seconds')::interval
           OR outcome_class IN ('insufficient_data', 'no_resolution')),

  UNIQUE (event_id, horizon)
);

CREATE INDEX IF NOT EXISTS brain_outcomes_ws_symbol_idx
  ON brain_outcomes (workspace_id, symbol, as_of_ts DESC);
CREATE INDEX IF NOT EXISTS brain_outcomes_class_idx
  ON brain_outcomes (outcome_class, horizon);

COMMENT ON TABLE brain_outcomes IS
  'Phase 2 outcome store. CHECK constraints enforce: data_through_ts > as_of_ts (no look-ahead) AND data span >= horizon.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Layer 4 — Edge scores (sample-size aware, regime-aware)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_edge_scores (
  edge_id               UUID PRIMARY KEY,
  workspace_id          VARCHAR(100) NOT NULL,                    -- 'global' allowed for cross-workspace research
  setup_key             VARCHAR(120) NOT NULL,                    -- canonical setup id (e.g. 'breakout|15m|equities|trend_up')
  regime                VARCHAR(40),
  asset_class           VARCHAR(20),
  timeframe             VARCHAR(20),
  horizon               VARCHAR(20)  NOT NULL,
  computed_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  window_start          TIMESTAMPTZ  NOT NULL,
  window_end            TIMESTAMPTZ  NOT NULL,

  -- Raw stats
  sample_size           INTEGER      NOT NULL,
  wins                  INTEGER      NOT NULL,
  losses                INTEGER      NOT NULL,
  neutrals              INTEGER      NOT NULL DEFAULT 0,
  win_rate              NUMERIC(6,4),
  avg_mfe_pct           NUMERIC(10,4),
  avg_mae_pct           NUMERIC(10,4),
  mfe_mae_ratio         NUMERIC(10,4),
  expectancy_proxy      NUMERIC(10,4),                            -- avg_mfe_pct * win_rate − avg_mae_pct * (1 − win_rate)
  vol_adj_expectancy    NUMERIC(10,4),
  regime_adj_expectancy NUMERIC(10,4),

  -- Confidence machinery
  wilson_lower_95       NUMERIC(6,4),                             -- lower bound of Wilson CI (sample-size aware)
  wilson_upper_95       NUMERIC(6,4),
  shrinkage_estimate    NUMERIC(6,4),                             -- empirical Bayes shrunk to prior
  sample_size_penalty   NUMERIC(6,4),                             -- 0..1 multiplier
  recency_weight        NUMERIC(6,4),                             -- 0..1 multiplier
  overfitting_penalty   NUMERIC(6,4),                             -- 0..1 multiplier
  stale_data_penalty    NUMERIC(6,4),                             -- 0..1 multiplier
  missing_data_penalty  NUMERIC(6,4),                             -- 0..1 multiplier

  -- Risk profile
  drawdown_sensitivity  NUMERIC(10,4),                            -- worst MAE in sample
  false_positive_rate   NUMERIC(6,4),                             -- failed_before_confirm / sample
  trap_rate             NUMERIC(6,4),                             -- confirmed_then_failed / sample
  confirmation_failure_rate NUMERIC(6,4),

  -- Final published score (UI-safe, throttled)
  edge_score            NUMERIC(6,4) NOT NULL,                    -- 0..1 final
  edge_tier             VARCHAR(20)  NOT NULL,                    -- noise | weak | emerging | strong | elite | insufficient_sample
  confidence_label      VARCHAR(20)  NOT NULL,                    -- low | medium | high
  confidence_reason     TEXT NOT NULL,

  -- Provenance
  scoring_model_version VARCHAR(40)  NOT NULL,
  inputs_hash           VARCHAR(64)  NOT NULL,                    -- sha256 of source outcome ids — replay determinism

  UNIQUE (workspace_id, setup_key, regime, horizon, scoring_model_version, computed_at)
);

CREATE INDEX IF NOT EXISTS brain_edge_scores_ws_setup_idx
  ON brain_edge_scores (workspace_id, setup_key, computed_at DESC);
CREATE INDEX IF NOT EXISTS brain_edge_scores_tier_idx
  ON brain_edge_scores (edge_tier, computed_at DESC);

COMMENT ON TABLE brain_edge_scores IS
  'Phase 2 edge scores. Win-rate alone NEVER drives edge_score — Wilson CI + shrinkage + sample-size penalty are mandatory.';

COMMIT;
