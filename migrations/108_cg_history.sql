-- Point-in-time crypto history for admin research backtests (CoinGecko). Rows keyed by the UTC date of a
-- 00:00 UTC observation (= close of the previous UTC day). Research only; no trading use.
CREATE TABLE IF NOT EXISTS cg_hist_coins (
  id            TEXT PRIMARY KEY,
  symbol        TEXT NOT NULL DEFAULT '',
  name          TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL CHECK (status IN ('active','inactive')),
  source        TEXT NOT NULL,
  chart_status  TEXT NOT NULL DEFAULT 'PENDING' CHECK (chart_status IN ('PENDING','OK','SMALL','NO_HISTORY','ERROR')),
  ohlc_status   TEXT NOT NULL DEFAULT 'NOT_NEEDED' CHECK (ohlc_status IN ('NOT_NEEDED','PENDING','OK','NO_HISTORY','ERROR')),
  ohlc_through  DATE,
  peak_mcap     DOUBLE PRECISION,
  first_day     DATE,
  last_day      DATE,
  stable        BOOLEAN NOT NULL DEFAULT FALSE,
  error         TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cg_hist_coins_status_idx ON cg_hist_coins (chart_status, ohlc_status);
CREATE TABLE IF NOT EXISTS cg_hist_daily (
  coin_id     TEXT NOT NULL REFERENCES cg_hist_coins(id) ON DELETE CASCADE,
  day         DATE NOT NULL,
  price       DOUBLE PRECISION,
  market_cap  DOUBLE PRECISION,
  volume      DOUBLE PRECISION,
  open        DOUBLE PRECISION,
  high        DOUBLE PRECISION,
  low         DOUBLE PRECISION,
  close       DOUBLE PRECISION,
  PRIMARY KEY (coin_id, day)
);
CREATE INDEX IF NOT EXISTS cg_hist_daily_day_mcap_idx ON cg_hist_daily (day, market_cap DESC);
CREATE TABLE IF NOT EXISTS cg_hist_global (
  day         DATE PRIMARY KEY,
  market_cap  DOUBLE PRECISION,
  volume      DOUBLE PRECISION
);
