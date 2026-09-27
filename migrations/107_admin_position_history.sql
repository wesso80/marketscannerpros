-- Market identity is mandatory; crypto and equity tickers may overlap.
CREATE TABLE IF NOT EXISTS admin_position_history (
  market TEXT NOT NULL,
  symbol TEXT NOT NULL,
  bars JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (market, symbol)
);
