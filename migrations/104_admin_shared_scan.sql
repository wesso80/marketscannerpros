-- =====================================================
-- 104_admin_shared_scan.sql
-- Shared, saved admin market scan (lib/admin/sharedScan.ts).
--
-- One scan job computes each symbol once per run and saves the result here. Priority Desk, Operator Terminal,
-- Opportunity Board, the operator radar and the edge-packet cron read these rows instead of rebuilding the
-- scan live (each of those used to re-fetch Alpha Vantage per page load / per workspace / per watchlist).
--
-- admin_scan_runs     one row per job run; also the overlap lock (one 'running' row per market+timeframe)
--                     and the manual-rescan rate limit (trigger = 'manual').
-- admin_scan_results  latest result per (market, timeframe, symbol). Upserted, so it never grows past the
--                     universe size (~265 rows per timeframe).
-- Idempotent. Until this is applied the admin pages show "saved scan unavailable" and no scan runs.
-- =====================================================

CREATE TABLE IF NOT EXISTS admin_scan_runs (
  run_id            TEXT PRIMARY KEY,
  market            TEXT NOT NULL CHECK (market IN ('EQUITIES', 'CRYPTO')),
  timeframe         TEXT NOT NULL,
  trigger           TEXT NOT NULL,                     -- cron | radar | edge | manual | page
  status            TEXT NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'done', 'failed', 'abandoned')),
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at       TIMESTAMPTZ,
  symbols_requested INTEGER NOT NULL DEFAULT 0,
  symbols_due       INTEGER NOT NULL DEFAULT 0,
  symbols_scanned   INTEGER NOT NULL DEFAULT 0,          -- full scans (15m bars + packet built)
  symbols_quoted    INTEGER NOT NULL DEFAULT 0,          -- quote-only refreshes (bulk quote, packet kept)
  symbols_failed    INTEGER NOT NULL DEFAULT 0,
  av_calls          INTEGER NOT NULL DEFAULT 0,
  vix_state         TEXT,
  radar_changes     JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{timestamp,symbol,action,permission,confidence}]
  error             TEXT,
  notes             JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Overlap lock: at most one running scan per market + timeframe.
CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_scan_runs_running
  ON admin_scan_runs (market, timeframe)
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS idx_admin_scan_runs_recent
  ON admin_scan_runs (market, timeframe, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_scan_runs_manual
  ON admin_scan_runs (market, started_at DESC)
  WHERE trigger = 'manual';

CREATE TABLE IF NOT EXISTS admin_scan_results (
  market        TEXT NOT NULL CHECK (market IN ('EQUITIES', 'CRYPTO')),
  timeframe     TEXT NOT NULL,
  symbol        TEXT NOT NULL,
  run_id        TEXT,                                   -- run that last touched this row
  status        TEXT NOT NULL CHECK (status IN ('ok', 'failed', 'skipped')),
  scanned_at    TIMESTAMPTZ,                            -- when the packet/radar below was built (NULL = never)
  checked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),     -- when a run last looked at this symbol (quote or scan)
  data_as_of    TIMESTAMPTZ,                            -- close time of the newest bar behind the packet
  price         NUMERIC(20,8),
  change_pct    NUMERIC(12,4),                          -- day change vs previous session close
  quote_at      TIMESTAMPTZ,
  packet        JSONB,                                  -- AdminResearchPacket (last good scan)
  hit           JSONB,                                  -- ScannerHit[] for the operator terminal
  radar         JSONB,                                  -- RadarOpportunity[] (non-BLOCK pipelines)
  error         TEXT,
  PRIMARY KEY (market, timeframe, symbol)
);

CREATE INDEX IF NOT EXISTS idx_admin_scan_results_scanned
  ON admin_scan_results (market, timeframe, scanned_at DESC);
