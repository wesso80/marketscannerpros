-- =====================================================
-- 101_jarvis_private_store.sql
-- Private owner-only persistence for the Jarvis overnight radar.
-- Never exposed through public routes. Idempotent.
-- =====================================================

CREATE TABLE IF NOT EXISTS jarvis_runs (
  run_key       TEXT PRIMARY KEY,            -- YYYY-MM-DD of the equity session basis (+ ':refresh' for crypto refreshes)
  generated_at  TIMESTAMPTZ NOT NULL,
  session_date  DATE NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('overnight', 'crypto_refresh')),
  report        JSONB NOT NULL,
  markdown      TEXT NOT NULL,
  snapshot      JSONB NOT NULL,              -- per-symbol compact state used for velocity / lifecycle
  api_usage     JSONB NOT NULL DEFAULT '{}'::jsonb,
  runtime_ms    INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_jarvis_runs_session ON jarvis_runs (session_date DESC);

CREATE TABLE IF NOT EXISTS jarvis_watchlist (
  key           TEXT PRIMARY KEY,            -- `${asset_class}:${symbol}`
  symbol        TEXT NOT NULL,
  asset_class   TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('NEW', 'DEVELOPING', 'NEAR_TRIGGER', 'CONFIRMED_MOVE', 'FAILED', 'DETERIORATING', 'EXPIRED')),
  first_seen    DATE NOT NULL,
  last_seen     DATE NOT NULL,
  sessions_seen INTEGER NOT NULL DEFAULT 1,
  origin        TEXT NOT NULL,               -- 'shortlist' | 'premove' | 'deteriorating'
  state         JSONB NOT NULL,              -- latest metrics + history of status changes
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_jarvis_watchlist_status ON jarvis_watchlist (status, last_seen DESC);

CREATE TABLE IF NOT EXISTS jarvis_kv (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
