-- ============================================================
-- Migration 042: daily_prices — Persistent daily bar cache
-- Eliminates redundant Alpha Vantage API calls for event studies.
-- Once a ticker's daily bars are stored, event studies read from
-- this table with zero external API calls.
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_prices (
  ticker     VARCHAR(20)  NOT NULL,
  bar_date   DATE         NOT NULL,
  open       DECIMAL(12,4) NOT NULL,
  high       DECIMAL(12,4) NOT NULL,
  low        DECIMAL(12,4) NOT NULL,
  close      DECIMAL(12,4) NOT NULL,
  volume     BIGINT       NOT NULL DEFAULT 0,
  source     VARCHAR(20)  NOT NULL DEFAULT 'alpha_vantage',
  fetched_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ticker, bar_date)
);

-- Index for date-range queries per ticker
CREATE INDEX IF NOT EXISTS idx_daily_prices_ticker_date
  ON daily_prices (ticker, bar_date DESC);

-- Index for batch operations: which tickers were updated recently
CREATE INDEX IF NOT EXISTS idx_daily_prices_fetched
  ON daily_prices (fetched_at DESC);
