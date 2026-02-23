-- ============================================================
-- Migration 039: catalyst_event_studies
-- Materialized/cached results for event-study computations.
-- One row per (ticker, subtype, cohort, lookback) combination.
-- ============================================================

CREATE TABLE IF NOT EXISTS catalyst_event_studies (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker             VARCHAR(20)  NOT NULL,
  catalyst_subtype   VARCHAR(50)  NOT NULL,
  cohort             VARCHAR(20)  NOT NULL,          -- TICKER | SECTOR | MARKET
  lookback_days      INT          NOT NULL,
  sample_n           INT          NOT NULL DEFAULT 0,
  computed_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  result_json        JSONB        NOT NULL DEFAULT '{}',
  data_quality_score DECIMAL(4,1) NOT NULL DEFAULT 0, -- 0.0–10.0
  notes              TEXT[]       DEFAULT '{}',
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Primary lookup for cached studies
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalyst_studies_lookup
  ON catalyst_event_studies (ticker, catalyst_subtype, cohort, lookback_days);
