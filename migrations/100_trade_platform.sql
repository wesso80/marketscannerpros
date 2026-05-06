-- Personal trade platform schema. Admin-only feature; isolated from public site.
-- Run once: psql $DATABASE_URL -f migrations/100_trade_platform.sql

CREATE TABLE IF NOT EXISTS trade_signals (
  id            BIGSERIAL PRIMARY KEY,
  source        TEXT NOT NULL,                -- 'tgs' | 'manual' | future strategies
  symbol        TEXT NOT NULL,
  kind          TEXT NOT NULL,                -- 'BUY' | 'SELL' | 'TP1_HIT' | 'TP2_HIT' | 'SL_HIT' | 'REACTION'
  price         NUMERIC(20, 8),
  entry         NUMERIC(20, 8),
  tp1           NUMERIC(20, 8),
  tp2           NUMERIC(20, 8),
  sl            NUMERIC(20, 8),
  rr            NUMERIC(10, 4),
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS trade_signals_symbol_time_idx ON trade_signals (symbol, received_at DESC);
CREATE INDEX IF NOT EXISTS trade_signals_source_kind_idx ON trade_signals (source, kind, received_at DESC);

-- Active trade overlays. One row per active TGS trade per symbol; closed when TP2/SL hit.
CREATE TABLE IF NOT EXISTS trade_overlays (
  id            BIGSERIAL PRIMARY KEY,
  source        TEXT NOT NULL,
  symbol        TEXT NOT NULL,
  direction     SMALLINT NOT NULL,            -- 1 long, -1 short
  entry         NUMERIC(20, 8) NOT NULL,
  tp1           NUMERIC(20, 8),
  tp2           NUMERIC(20, 8),
  sl            NUMERIC(20, 8),
  opened_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at     TIMESTAMPTZ,
  closed_reason TEXT,                         -- 'TP1' | 'TP2' | 'SL' | 'MANUAL' | 'REPLACED'
  meta          JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS trade_overlays_active_idx
  ON trade_overlays (symbol, opened_at DESC) WHERE closed_at IS NULL;

-- OMS orders. Paper-only until a live broker adapter is wired and enabled by env.
CREATE TABLE IF NOT EXISTS trade_orders (
  id            BIGSERIAL PRIMARY KEY,
  client_order_id TEXT UNIQUE NOT NULL,        -- idempotency key (uuid)
  broker        TEXT NOT NULL,                 -- 'paper' | future 'tradovate' etc
  account       TEXT NOT NULL,                 -- broker account id
  symbol        TEXT NOT NULL,
  side          TEXT NOT NULL,                 -- 'BUY' | 'SELL'
  qty           NUMERIC(20, 8) NOT NULL,
  order_type    TEXT NOT NULL,                 -- 'MKT' | 'LMT' | 'STP' | 'BRACKET'
  limit_price   NUMERIC(20, 8),
  stop_price    NUMERIC(20, 8),
  tp_price      NUMERIC(20, 8),
  sl_price      NUMERIC(20, 8),
  status        TEXT NOT NULL DEFAULT 'PENDING', -- PENDING|SUBMITTED|WORKING|FILLED|PARTIAL|CANCELED|REJECTED
  filled_qty    NUMERIC(20, 8) NOT NULL DEFAULT 0,
  avg_fill_price NUMERIC(20, 8),
  reject_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta          JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS trade_orders_status_idx ON trade_orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS trade_orders_symbol_idx  ON trade_orders (symbol, created_at DESC);

-- Immutable audit log for every signal/risk-check/order/fill/manual action.
CREATE TABLE IF NOT EXISTS trade_audit_log (
  id            BIGSERIAL PRIMARY KEY,
  ts            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  category      TEXT NOT NULL,    -- 'signal' | 'risk' | 'order' | 'fill' | 'manual' | 'system'
  actor         TEXT NOT NULL,    -- 'tgs' | 'admin:<cid>' | 'broker:paper' | 'system'
  action        TEXT NOT NULL,
  symbol        TEXT,
  ref_table     TEXT,
  ref_id        BIGINT,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS trade_audit_log_ts_idx ON trade_audit_log (ts DESC);
CREATE INDEX IF NOT EXISTS trade_audit_log_category_idx ON trade_audit_log (category, ts DESC);
