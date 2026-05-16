-- migrations/083_macro_series.sql
-- Persistent macro time-series store. Powers the Macro Pulse page,
-- cross-asset confluence engine, and regime classifier.
--
-- Series are identified by a stable string key (e.g. 'FED_FUNDS_RATE',
-- 'VIX', 'MOVE', 'DXY', 'US10Y', 'CREDIT_SPREAD_HYG_LQD').
-- Each row is a single (series, date) observation.

CREATE TABLE IF NOT EXISTS macro_series (
  series_key    VARCHAR(64) NOT NULL,
  observed_on   DATE        NOT NULL,
  value         NUMERIC(20,8) NOT NULL,
  source        VARCHAR(32) NOT NULL,           -- 'alpha-vantage' | 'fred' | 'derived'
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (series_key, observed_on)
);

CREATE INDEX IF NOT EXISTS idx_macro_series_key_time
  ON macro_series (series_key, observed_on DESC);

-- Metadata for each series (description, units, expected cadence).
CREATE TABLE IF NOT EXISTS macro_series_meta (
  series_key    VARCHAR(64) PRIMARY KEY,
  description   TEXT        NOT NULL,
  units         VARCHAR(32),
  cadence       VARCHAR(16) NOT NULL,           -- 'daily' | 'weekly' | 'monthly' | 'quarterly'
  category      VARCHAR(32),                    -- 'rates' | 'vol' | 'fx' | 'credit' | 'liquidity' | 'sentiment'
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
