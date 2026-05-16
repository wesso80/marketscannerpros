-- migrations/087_edge_matrix_cache.sql
-- Materialised aggregation of the edge ledger: per-playbook, per-regime
-- performance summaries. Rebuilt nightly by the edge-matrix cron.
--
-- This is what the /admin/edge-ledger page reads — fast, pre-aggregated,
-- no expensive joins at request time.

CREATE TABLE IF NOT EXISTS edge_matrix_cells (
  id                BIGSERIAL PRIMARY KEY,
  workspace_id      UUID        NOT NULL,
  dimension         VARCHAR(48) NOT NULL,            -- 'playbook' | 'regime' | 'sector' | 'iv_bucket' | 'catalyst_proximity' | 'time_of_day' | 'day_of_week'
  cell_key          VARCHAR(128) NOT NULL,           -- e.g. 'vwap-reclaim', 'trend-up', 'tech', 'iv>70', 'cat-0-3d'

  -- Counts
  setups_total      INT         NOT NULL DEFAULT 0,
  setups_taken      INT         NOT NULL DEFAULT 0,
  setups_skipped    INT         NOT NULL DEFAULT 0,

  -- Performance (taken only)
  win_rate          NUMERIC(6,3),                    -- 0..1
  avg_r_5d          NUMERIC(8,3),
  avg_r_20d         NUMERIC(8,3),
  hit_target_rate   NUMERIC(6,3),
  hit_stop_rate     NUMERIC(6,3),

  -- Counterfactual (skipped — what would have happened if taken)
  cf_win_rate       NUMERIC(6,3),
  cf_avg_r_5d       NUMERIC(8,3),
  cf_avg_r_20d      NUMERIC(8,3),

  -- Sample-size honesty
  min_sample        INT         NOT NULL DEFAULT 0,  -- how many fully-labelled outcomes back these stats
  confidence_band   VARCHAR(16),                     -- 'tight' | 'wide' | 'insufficient'

  rebuilt_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, dimension, cell_key)
);

CREATE INDEX IF NOT EXISTS idx_edge_matrix_ws_dim
  ON edge_matrix_cells (workspace_id, dimension);

CREATE INDEX IF NOT EXISTS idx_edge_matrix_rebuilt
  ON edge_matrix_cells (rebuilt_at);
