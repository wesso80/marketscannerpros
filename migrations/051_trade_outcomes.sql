-- 051: Trade Outcomes — Analytics foundation for v3 Adaptive Intelligence
-- Denormalized, enriched trade result records computed from journal_entries + snapshots.
-- Designed for fast aggregation by the edge-profile stats engine.

CREATE TABLE IF NOT EXISTS trade_outcomes (
  id              BIGSERIAL PRIMARY KEY,
  workspace_id    TEXT        NOT NULL,
  journal_entry_id INTEGER   NOT NULL,

  -- ── Core trade identity ──
  symbol          VARCHAR(32) NOT NULL,
  asset_class     VARCHAR(16) NOT NULL DEFAULT 'equity',   -- crypto|equity|forex|commodity
  side            VARCHAR(8)  NOT NULL,                     -- LONG|SHORT
  trade_type      VARCHAR(16) NOT NULL DEFAULT 'Spot',      -- Spot|Options|Futures|Margin

  -- ── Timing ──
  entry_ts        TIMESTAMPTZ NOT NULL,
  exit_ts         TIMESTAMPTZ,
  hold_duration_m INTEGER,        -- minutes between entry and exit
  day_of_week     SMALLINT,       -- 0=Sun .. 6=Sat (entry day)
  hour_of_day     SMALLINT,       -- 0-23 UTC (entry hour)

  -- ── Setup context ──
  strategy        VARCHAR(120),
  setup           VARCHAR(120),
  tags            TEXT[],

  -- ── Confluence & confidence at entry ──
  scanner_score       NUMERIC(5,1),   -- 0-100 from scan if captured
  confidence          NUMERIC(5,3),   -- 0-1.0 from scan
  confluence_count    SMALLINT,       -- # aligned signals (bullish+bearish total)

  -- ── Market regime at entry ──
  regime              VARCHAR(32),    -- TREND_UP|TREND_DOWN|RANGE_NEUTRAL|VOL_EXPANSION|VOL_CONTRACTION|RISK_OFF_STRESS
  volatility_regime   VARCHAR(16),    -- compression|normal|expansion|climax
  atr_at_entry        NUMERIC(18,8),
  adx_at_entry        NUMERIC(6,2),
  rsi_at_entry        NUMERIC(6,2),

  -- ── Risk metrics (frozen at entry) ──
  entry_price         NUMERIC(18,8) NOT NULL,
  exit_price          NUMERIC(18,8),
  stop_loss           NUMERIC(18,8),
  target              NUMERIC(18,8),
  planned_rr          NUMERIC(8,4),
  equity_at_entry     NUMERIC(18,4),

  -- ── Outcome metrics ──
  realized_pl         NUMERIC(18,4),
  pl_percent          NUMERIC(10,4),
  r_multiple          NUMERIC(8,4),
  normalized_r        NUMERIC(8,4),

  -- ── Outcome classification ──
  outcome             VARCHAR(16) NOT NULL,   -- win|loss|breakeven
  outcome_label       VARCHAR(24),            -- big_win|small_win|breakeven|small_loss|big_loss

  -- ── Execution quality ──
  followed_plan       BOOLEAN,
  exit_reason         VARCHAR(32),            -- tp|sl|manual|time|invalidated|drawdown
  close_source        VARCHAR(16),            -- manual|mark|broker

  -- ── Metadata ──
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version             SMALLINT    NOT NULL DEFAULT 1,

  CONSTRAINT uq_trade_outcome UNIQUE (workspace_id, journal_entry_id)
);

-- Fast edge-profile aggregation indexes
CREATE INDEX IF NOT EXISTS idx_to_ws
  ON trade_outcomes (workspace_id);

CREATE INDEX IF NOT EXISTS idx_to_ws_asset
  ON trade_outcomes (workspace_id, asset_class);

CREATE INDEX IF NOT EXISTS idx_to_ws_strategy
  ON trade_outcomes (workspace_id, strategy);

CREATE INDEX IF NOT EXISTS idx_to_ws_regime
  ON trade_outcomes (workspace_id, regime);

CREATE INDEX IF NOT EXISTS idx_to_ws_exit_ts
  ON trade_outcomes (workspace_id, exit_ts DESC);

-- Composite for multi-dimension queries
CREATE INDEX IF NOT EXISTS idx_to_ws_composite
  ON trade_outcomes (workspace_id, asset_class, side, outcome);
