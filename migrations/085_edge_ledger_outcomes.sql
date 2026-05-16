-- migrations/085_edge_ledger_outcomes.sql
-- Outcomes for every surfaced setup — labelled by the nightly outcome cron
-- by reading forward bars after the setup's surfaced_at.
--
-- Critical: outcomes are computed from REAL bars, not from any user input.
-- This keeps the ledger honest whether the user took the trade or not.

CREATE TABLE IF NOT EXISTS edge_ledger_outcomes (
  setup_id          BIGINT      PRIMARY KEY REFERENCES edge_ledger_setups(id) ON DELETE CASCADE,
  workspace_id      UUID        NOT NULL,

  -- Forward bar outcomes
  mfe_1d            NUMERIC(10,4),                 -- max favourable excursion (in R-multiples)
  mae_1d            NUMERIC(10,4),                 -- max adverse excursion
  mfe_5d            NUMERIC(10,4),
  mae_5d            NUMERIC(10,4),
  mfe_20d           NUMERIC(10,4),
  mae_20d           NUMERIC(10,4),

  -- Did it hit target / stop within window? (target/stop from setup row)
  hit_target_5d     BOOLEAN,
  hit_stop_5d       BOOLEAN,
  hit_target_20d    BOOLEAN,
  hit_stop_20d      BOOLEAN,

  -- Time-to-target / time-to-stop (in trading days)
  ttt_days          INT,
  tts_days          INT,

  -- Realised R (signed, in R-multiples). NULL if window not closed.
  realised_r_5d     NUMERIC(10,4),
  realised_r_20d    NUMERIC(10,4),

  -- Bars used to compute the labels (audit trail)
  bars_used         INT,
  outcome_status    VARCHAR(16) NOT NULL DEFAULT 'pending',  -- 'pending' | 'partial' | 'complete'
  labelled_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_edge_outcomes_ws
  ON edge_ledger_outcomes (workspace_id);

CREATE INDEX IF NOT EXISTS idx_edge_outcomes_status
  ON edge_ledger_outcomes (outcome_status, labelled_at);
