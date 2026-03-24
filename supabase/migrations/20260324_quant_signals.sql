-- ============================================================================
-- Quant Intelligence Layer — Database Migration
-- Private internal tables for signal tracking and outcome learning
-- ============================================================================

-- Signal outcomes (Layer 6 — Memory)
CREATE TABLE IF NOT EXISTS quant_signal_outcomes (
  id              BIGSERIAL PRIMARY KEY,
  alert_id        TEXT UNIQUE NOT NULL,
  symbol          TEXT NOT NULL,
  direction       TEXT NOT NULL CHECK (direction IN ('LONG', 'SHORT')),
  fusion_score    REAL NOT NULL,
  regime          TEXT NOT NULL,
  price_at_signal REAL NOT NULL,
  price_at_peak   REAL,
  price_at_trough REAL,
  price_at_close  REAL,
  outcome         TEXT NOT NULL DEFAULT 'PENDING'
                  CHECK (outcome IN ('WIN', 'LOSS', 'FLAT', 'EXPIRED', 'PENDING')),
  r_multiple      REAL,
  hold_bars       INTEGER,
  mfe             REAL,
  mae             REAL,
  dimension_scores JSONB,
  closed_at       TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qso_symbol ON quant_signal_outcomes (symbol);
CREATE INDEX IF NOT EXISTS idx_qso_outcome ON quant_signal_outcomes (outcome);
CREATE INDEX IF NOT EXISTS idx_qso_regime ON quant_signal_outcomes (regime);
CREATE INDEX IF NOT EXISTS idx_qso_created ON quant_signal_outcomes (created_at DESC);

-- Scan history (Pipeline audit trail)
CREATE TABLE IF NOT EXISTS quant_scan_history (
  id                BIGSERIAL PRIMARY KEY,
  regime_phase      TEXT NOT NULL,
  regime_confidence REAL NOT NULL,
  regime_agreement  INTEGER NOT NULL,
  symbols_scanned   INTEGER NOT NULL,
  symbols_passed    INTEGER NOT NULL,
  alerts_generated  INTEGER NOT NULL,
  scan_duration_ms  INTEGER NOT NULL,
  alerts_json       JSONB,
  timestamp         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qsh_timestamp ON quant_scan_history (timestamp DESC);

-- RLS: these tables are internal-only, no user access
-- If using Supabase, enable RLS but grant only to service_role
ALTER TABLE quant_signal_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quant_scan_history ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access (API routes use service key)
CREATE POLICY "service_role_full_access_outcomes" ON quant_signal_outcomes
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access_history" ON quant_scan_history
  FOR ALL USING (true) WITH CHECK (true);
