-- migrations/095_arca_portfolio_lab.sql
--
-- ARCA Autonomous Portfolio Lab.
--
-- Admin-only SIMULATED paper trading platform. There is no broker
-- connection, no order routing, no live execution path. Every "order"
-- and "position" in these tables is a simulation against AdminEdgePacket
-- decision levels and AdminMarketPacket prices.
--
-- Workspace-isolated. All queries MUST filter by workspace_id.

-- ────────────────────────────────────────────────────────────────
-- 1. Portfolios
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS arca_portfolios (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID            NOT NULL,
  name                TEXT            NOT NULL,
  mode                TEXT            NOT NULL DEFAULT 'SIMULATED'
    CHECK (mode = 'SIMULATED'),                  -- hard guard: never live
  starting_balance    NUMERIC(16,2)   NOT NULL,
  current_cash        NUMERIC(16,2)   NOT NULL,
  realised_pnl        NUMERIC(16,2)   NOT NULL DEFAULT 0,
  unrealised_pnl      NUMERIC(16,2)   NOT NULL DEFAULT 0,
  total_equity        NUMERIC(16,2)   NOT NULL,
  base_currency       TEXT            NOT NULL DEFAULT 'USD',
  status              TEXT            NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','PAUSED','ARCHIVED')),
  settings_json       JSONB           NOT NULL DEFAULT '{}'::JSONB,
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS arca_portfolios_workspace_name_idx
  ON arca_portfolios (workspace_id, name);

-- ────────────────────────────────────────────────────────────────
-- 2. Simulated orders
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS arca_simulated_orders (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             UUID         NOT NULL,
  portfolio_id             UUID         NOT NULL REFERENCES arca_portfolios(id) ON DELETE CASCADE,
  symbol                   TEXT         NOT NULL,
  asset_class              TEXT         NOT NULL,
  instrument_type          TEXT         NOT NULL DEFAULT 'spot',
  side                     TEXT         NOT NULL
    CHECK (side IN ('BUY','SELL','LONG','SHORT')),
  order_type               TEXT         NOT NULL DEFAULT 'LIMIT_SIM'
    CHECK (order_type IN ('MARKET_SIM','LIMIT_SIM','STOP_SIM')),
  status                   TEXT         NOT NULL DEFAULT 'PLANNED'
    CHECK (status IN ('PLANNED','WAITING_FOR_TRIGGER','TRIGGERED','FILLED_SIM','CANCELLED','EXPIRED','INVALIDATED_BEFORE_FILL')),
  planned_entry            NUMERIC(18,8),
  trigger_price            NUMERIC(18,8),
  filled_price             NUMERIC(18,8),
  quantity                 NUMERIC(20,8) NOT NULL,
  notional_value           NUMERIC(18,2),
  stop_loss                NUMERIC(18,8),
  take_profit_1            NUMERIC(18,8),
  take_profit_2            NUMERIC(18,8),
  take_profit_3            NUMERIC(18,8),
  time_in_force            TEXT         NOT NULL DEFAULT 'GTC_SIM',
  source_edge_packet_id    TEXT,
  source_market_packet_id  TEXT,
  playbook_id              TEXT,
  created_reason           TEXT,
  arca_confidence          NUMERIC(5,2),
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  triggered_at             TIMESTAMPTZ,
  filled_at                TIMESTAMPTZ,
  cancelled_at             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS arca_simulated_orders_portfolio_status_idx
  ON arca_simulated_orders (workspace_id, portfolio_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS arca_simulated_orders_symbol_idx
  ON arca_simulated_orders (workspace_id, symbol, created_at DESC);

-- ────────────────────────────────────────────────────────────────
-- 3. Positions
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS arca_positions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             UUID         NOT NULL,
  portfolio_id             UUID         NOT NULL REFERENCES arca_portfolios(id) ON DELETE CASCADE,
  symbol                   TEXT         NOT NULL,
  asset_class              TEXT         NOT NULL,
  instrument_type          TEXT         NOT NULL DEFAULT 'spot',
  side                     TEXT         NOT NULL CHECK (side IN ('LONG','SHORT')),
  quantity                 NUMERIC(20,8) NOT NULL,
  average_entry            NUMERIC(18,8) NOT NULL,
  current_price            NUMERIC(18,8),
  stop_loss                NUMERIC(18,8),
  take_profit_1            NUMERIC(18,8),
  take_profit_2            NUMERIC(18,8),
  take_profit_3            NUMERIC(18,8),
  realised_pnl             NUMERIC(16,2) NOT NULL DEFAULT 0,
  unrealised_pnl           NUMERIC(16,2) NOT NULL DEFAULT 0,
  open_risk                NUMERIC(16,2) NOT NULL DEFAULT 0,
  current_r_multiple       NUMERIC(8,3),
  status                   TEXT         NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN','PARTIAL_TP1','PARTIAL_TP2','RUNNER','STOPPED','TARGET_HIT','CLOSED_BY_RULE','INVALIDATED','EXPIRED','CLOSED')),
  opened_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_mark_at             TIMESTAMPTZ,
  closed_at                TIMESTAMPTZ,
  source_order_id          UUID REFERENCES arca_simulated_orders(id) ON DELETE SET NULL,
  source_edge_packet_id    TEXT,
  playbook_id              TEXT
);

CREATE INDEX IF NOT EXISTS arca_positions_open_idx
  ON arca_positions (workspace_id, portfolio_id, status) WHERE status NOT IN ('CLOSED','STOPPED','TARGET_HIT','EXPIRED','CLOSED_BY_RULE','INVALIDATED');
CREATE INDEX IF NOT EXISTS arca_positions_symbol_idx
  ON arca_positions (workspace_id, symbol, opened_at DESC);

-- ────────────────────────────────────────────────────────────────
-- 4. Closed trades
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS arca_trades (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             UUID         NOT NULL,
  portfolio_id             UUID         NOT NULL REFERENCES arca_portfolios(id) ON DELETE CASCADE,
  position_id              UUID REFERENCES arca_positions(id) ON DELETE SET NULL,
  symbol                   TEXT         NOT NULL,
  asset_class              TEXT         NOT NULL,
  instrument_type          TEXT         NOT NULL DEFAULT 'spot',
  side                     TEXT         NOT NULL CHECK (side IN ('LONG','SHORT')),
  entry_price              NUMERIC(18,8) NOT NULL,
  exit_price               NUMERIC(18,8) NOT NULL,
  quantity                 NUMERIC(20,8) NOT NULL,
  notional_value           NUMERIC(18,2),
  stop_loss                NUMERIC(18,8),
  take_profit_1            NUMERIC(18,8),
  take_profit_2            NUMERIC(18,8),
  take_profit_3            NUMERIC(18,8),
  entry_time               TIMESTAMPTZ  NOT NULL,
  exit_time                TIMESTAMPTZ  NOT NULL,
  realised_pnl             NUMERIC(16,2) NOT NULL,
  r_multiple               NUMERIC(8,3),
  fees_estimate            NUMERIC(10,4) NOT NULL DEFAULT 0,
  slippage_estimate        NUMERIC(10,4) NOT NULL DEFAULT 0,
  outcome                  TEXT         NOT NULL
    CHECK (outcome IN ('WIN','LOSS','BREAKEVEN','PARTIAL','OPEN')),
  exit_reason              TEXT         NOT NULL
    CHECK (exit_reason IN ('STOP_LOSS','TAKE_PROFIT','TIME_EXIT','SIGNAL_INVALIDATED','MANUAL_SIM_CLOSE','RULE_EXIT')),
  playbook_id              TEXT,
  source_edge_packet_id    TEXT,
  source_market_packet_id  TEXT,
  arca_confidence          NUMERIC(5,2),
  arca_reason_summary      TEXT,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS arca_trades_portfolio_idx
  ON arca_trades (workspace_id, portfolio_id, exit_time DESC);
CREATE INDEX IF NOT EXISTS arca_trades_playbook_idx
  ON arca_trades (workspace_id, playbook_id, exit_time DESC);

-- ────────────────────────────────────────────────────────────────
-- 5. Trade journal
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS arca_trade_journal (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             UUID         NOT NULL,
  portfolio_id             UUID         NOT NULL REFERENCES arca_portfolios(id) ON DELETE CASCADE,
  trade_id                 UUID REFERENCES arca_trades(id) ON DELETE SET NULL,
  position_id              UUID REFERENCES arca_positions(id) ON DELETE SET NULL,
  order_id                 UUID REFERENCES arca_simulated_orders(id) ON DELETE SET NULL,
  symbol                   TEXT,
  journal_type             TEXT         NOT NULL
    CHECK (journal_type IN ('ENTRY','UPDATE','EXIT','REVIEW','ERROR','OVERRIDE','REJECTED','RISK_BLOCK')),
  title                    TEXT         NOT NULL,
  arca_reasoning           TEXT,
  evidence                 JSONB        NOT NULL DEFAULT '[]'::JSONB,
  contradiction_evidence   JSONB        NOT NULL DEFAULT '[]'::JSONB,
  bear_case                TEXT,
  data_freshness           TEXT,
  source_packet_ids        JSONB        NOT NULL DEFAULT '[]'::JSONB,
  screenshot_url           TEXT,
  brad_notes               TEXT,
  lessons                  TEXT,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS arca_trade_journal_portfolio_idx
  ON arca_trade_journal (workspace_id, portfolio_id, created_at DESC);
CREATE INDEX IF NOT EXISTS arca_trade_journal_symbol_idx
  ON arca_trade_journal (workspace_id, symbol, created_at DESC);
CREATE INDEX IF NOT EXISTS arca_trade_journal_type_idx
  ON arca_trade_journal (workspace_id, portfolio_id, journal_type, created_at DESC);

-- ────────────────────────────────────────────────────────────────
-- 6. Portfolio snapshots (equity curve)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS arca_portfolio_snapshots (
  id                       BIGSERIAL PRIMARY KEY,
  workspace_id             UUID         NOT NULL,
  portfolio_id             UUID         NOT NULL REFERENCES arca_portfolios(id) ON DELETE CASCADE,
  snapshot_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  cash                     NUMERIC(16,2) NOT NULL,
  total_equity             NUMERIC(16,2) NOT NULL,
  realised_pnl             NUMERIC(16,2) NOT NULL,
  unrealised_pnl           NUMERIC(16,2) NOT NULL,
  daily_pnl                NUMERIC(16,2),
  drawdown_pct             NUMERIC(6,3),
  exposure_equities        NUMERIC(16,2) NOT NULL DEFAULT 0,
  exposure_crypto          NUMERIC(16,2) NOT NULL DEFAULT 0,
  exposure_commodities     NUMERIC(16,2) NOT NULL DEFAULT 0,
  exposure_options         NUMERIC(16,2) NOT NULL DEFAULT 0,
  exposure_futures         NUMERIC(16,2) NOT NULL DEFAULT 0,
  open_positions_count     INTEGER       NOT NULL DEFAULT 0,
  open_risk_pct            NUMERIC(6,3),
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS arca_portfolio_snapshots_portfolio_time_idx
  ON arca_portfolio_snapshots (workspace_id, portfolio_id, snapshot_at DESC);

-- ────────────────────────────────────────────────────────────────
-- 7. Risk events
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS arca_risk_events (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             UUID         NOT NULL,
  portfolio_id             UUID         NOT NULL REFERENCES arca_portfolios(id) ON DELETE CASCADE,
  event_type               TEXT         NOT NULL,    -- e.g. MAX_DAILY_DD, MAX_PORTFOLIO_RISK, LOSING_STREAK
  severity                 TEXT         NOT NULL CHECK (severity IN ('info','warning','critical','kill_switch')),
  message                  TEXT         NOT NULL,
  affected_symbol          TEXT,
  affected_position_id     UUID REFERENCES arca_positions(id) ON DELETE SET NULL,
  value                    NUMERIC(16,4),
  threshold                NUMERIC(16,4),
  acknowledged             BOOLEAN      NOT NULL DEFAULT FALSE,
  acknowledged_at          TIMESTAMPTZ,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS arca_risk_events_portfolio_idx
  ON arca_risk_events (workspace_id, portfolio_id, acknowledged, created_at DESC);

-- ────────────────────────────────────────────────────────────────
-- 8. Daily/evening/weekly reports
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS arca_daily_reports (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             UUID         NOT NULL,
  portfolio_id             UUID         NOT NULL REFERENCES arca_portfolios(id) ON DELETE CASCADE,
  report_date              DATE         NOT NULL,
  report_type              TEXT         NOT NULL
    CHECK (report_type IN ('DAILY_OPERATOR','EVENING_RECONCILIATION','WEEKLY_REVIEW')),
  summary                  TEXT,
  best_trade               JSONB,
  worst_trade              JSONB,
  top_opportunities        JSONB        NOT NULL DEFAULT '[]'::JSONB,
  risk_summary             JSONB,
  performance_summary      JSONB,
  lessons                  TEXT,
  report_json              JSONB        NOT NULL,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS arca_daily_reports_unique_idx
  ON arca_daily_reports (workspace_id, portfolio_id, report_date, report_type);

-- ────────────────────────────────────────────────────────────────
-- 9. Playbook performance (rolling)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS arca_playbook_performance (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             UUID         NOT NULL,
  portfolio_id             UUID         NOT NULL REFERENCES arca_portfolios(id) ON DELETE CASCADE,
  playbook_id              TEXT         NOT NULL,
  setup_count              INTEGER      NOT NULL DEFAULT 0,
  trades_taken             INTEGER      NOT NULL DEFAULT 0,
  wins                     INTEGER      NOT NULL DEFAULT 0,
  losses                   INTEGER      NOT NULL DEFAULT 0,
  win_rate                 NUMERIC(6,3),
  average_r                NUMERIC(8,3),
  total_pnl                NUMERIC(16,2) NOT NULL DEFAULT 0,
  max_drawdown             NUMERIC(8,3),
  expectancy               NUMERIC(8,3),
  best_asset_class         TEXT,
  worst_asset_class        TEXT,
  last_updated             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS arca_playbook_performance_unique_idx
  ON arca_playbook_performance (workspace_id, portfolio_id, playbook_id);

-- ────────────────────────────────────────────────────────────────
-- 10. Benchmark snapshots
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS arca_benchmark_snapshots (
  id                       BIGSERIAL PRIMARY KEY,
  workspace_id             UUID         NOT NULL,
  portfolio_id             UUID         NOT NULL REFERENCES arca_portfolios(id) ON DELETE CASCADE,
  benchmark_symbol         TEXT         NOT NULL,
  snapshot_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  benchmark_value          NUMERIC(18,4) NOT NULL,
  benchmark_return_pct     NUMERIC(8,4),
  arca_return_pct          NUMERIC(8,4),
  relative_performance_pct NUMERIC(8,4),
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS arca_benchmark_snapshots_idx
  ON arca_benchmark_snapshots (workspace_id, portfolio_id, benchmark_symbol, snapshot_at DESC);
