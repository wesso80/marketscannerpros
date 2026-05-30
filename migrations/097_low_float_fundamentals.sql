-- migrations/097_low_float_fundamentals.sql
-- Extend company_overview (mig 081) with the float / short fields needed for
-- low-float scanning. AV OVERVIEW returns these directly; persisting them
-- avoids per-scan API calls. Refresh policy: daily after US close via the
-- refresh-fundamentals cron.

ALTER TABLE company_overview
  ADD COLUMN IF NOT EXISTS shares_float       BIGINT,
  ADD COLUMN IF NOT EXISTS shares_short       BIGINT,
  ADD COLUMN IF NOT EXISTS short_pct_float    NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS short_ratio        NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS insider_pct        NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS institution_pct    NUMERIC(10,4);

-- Categorise float at write time for fast scanner filters.
-- micro  : < 10M shares (squeeze candidates)
-- low    : 10M – 20M    (classic low-float momentum)
-- mid    : 20M – 50M    (rotational small-cap)
-- normal : >= 50M
ALTER TABLE company_overview
  ADD COLUMN IF NOT EXISTS float_category TEXT;

CREATE INDEX IF NOT EXISTS idx_company_overview_float
  ON company_overview (shares_float)
  WHERE shares_float IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_company_overview_float_category
  ON company_overview (float_category)
  WHERE float_category IS NOT NULL;
