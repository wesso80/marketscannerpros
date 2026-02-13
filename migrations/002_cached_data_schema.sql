-- =============================================================================
-- MSP Cached Data Schema
-- This schema supports the centralized ingestion architecture:
-- Worker fetches data → stores in these tables → API/UI reads from cache
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Symbol Universe & Tiering
-- -----------------------------------------------------------------------------
-- Track which symbols to fetch and how often
CREATE TABLE IF NOT EXISTS symbol_universe (
  symbol VARCHAR(20) PRIMARY KEY,
  asset_type VARCHAR(20) NOT NULL DEFAULT 'equity', -- equity, crypto, forex, commodity
  name VARCHAR(255),
  tier SMALLINT NOT NULL DEFAULT 2, -- 1=fast (15-30s), 2=standard (60s), 3=slow (5min)
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_fetched_at TIMESTAMPTZ,
  fetch_error_count INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_symbol_universe_enabled ON symbol_universe(enabled, tier);
CREATE INDEX IF NOT EXISTS idx_symbol_universe_asset ON symbol_universe(asset_type, enabled);

-- -----------------------------------------------------------------------------
-- 2. Latest Quotes (Prices)
-- -----------------------------------------------------------------------------
-- Single-row-per-symbol table for latest price data
CREATE TABLE IF NOT EXISTS quotes_latest (
  symbol VARCHAR(20) PRIMARY KEY,
  price NUMERIC(18,8),
  open NUMERIC(18,8),
  high NUMERIC(18,8),
  low NUMERIC(18,8),
  prev_close NUMERIC(18,8),
  volume BIGINT,
  change_amount NUMERIC(18,8),
  change_percent NUMERIC(10,4),
  latest_trading_day DATE,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quotes_latest_fetched ON quotes_latest(fetched_at);

-- -----------------------------------------------------------------------------
-- 3. OHLCV Bars (Intraday/Daily)
-- -----------------------------------------------------------------------------
-- Store recent bars for indicator calculation
-- Keep last 500 bars per symbol/timeframe (enough for 200 EMA + buffer)
CREATE TABLE IF NOT EXISTS ohlcv_bars (
  symbol VARCHAR(20) NOT NULL,
  timeframe VARCHAR(10) NOT NULL, -- 1min, 5min, 15min, 30min, 60min, daily
  ts TIMESTAMPTZ NOT NULL,
  open NUMERIC(18,8) NOT NULL,
  high NUMERIC(18,8) NOT NULL,
  low NUMERIC(18,8) NOT NULL,
  close NUMERIC(18,8) NOT NULL,
  volume BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (symbol, timeframe, ts)
);

CREATE INDEX IF NOT EXISTS idx_ohlcv_bars_symbol_tf ON ohlcv_bars(symbol, timeframe);
CREATE INDEX IF NOT EXISTS idx_ohlcv_bars_ts ON ohlcv_bars(ts);

-- -----------------------------------------------------------------------------
-- 4. Computed Indicators (Latest)
-- -----------------------------------------------------------------------------
-- Pre-computed indicators per symbol/timeframe
CREATE TABLE IF NOT EXISTS indicators_latest (
  symbol VARCHAR(20) NOT NULL,
  timeframe VARCHAR(10) NOT NULL,
  rsi14 NUMERIC(10,4),
  macd_line NUMERIC(18,8),
  macd_signal NUMERIC(18,8),
  macd_hist NUMERIC(18,8),
  ema9 NUMERIC(18,8),
  ema20 NUMERIC(18,8),
  ema50 NUMERIC(18,8),
  ema200 NUMERIC(18,8),
  sma20 NUMERIC(18,8),
  sma50 NUMERIC(18,8),
  sma200 NUMERIC(18,8),
  atr14 NUMERIC(18,8),
  adx14 NUMERIC(10,4),
  plus_di NUMERIC(10,4),
  minus_di NUMERIC(10,4),
  stoch_k NUMERIC(10,4),
  stoch_d NUMERIC(10,4),
  cci20 NUMERIC(10,4),
  bb_upper NUMERIC(18,8),
  bb_middle NUMERIC(18,8),
  bb_lower NUMERIC(18,8),
  obv BIGINT,
  vwap NUMERIC(18,8),
  in_squeeze BOOLEAN,
  squeeze_strength INT,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (symbol, timeframe)
);

CREATE INDEX IF NOT EXISTS idx_indicators_latest_squeeze ON indicators_latest(in_squeeze) WHERE in_squeeze = TRUE;

-- -----------------------------------------------------------------------------
-- 5. Options Chain (Latest Snapshot)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS options_chain_latest (
  symbol VARCHAR(20) NOT NULL,
  expiry DATE NOT NULL,
  strike NUMERIC(12,4) NOT NULL,
  option_type CHAR(1) NOT NULL CHECK (option_type IN ('C','P')),
  bid NUMERIC(12,4),
  ask NUMERIC(12,4),
  last NUMERIC(12,4),
  fmv NUMERIC(12,4), -- Fair Market Value if available
  volume BIGINT,
  open_interest BIGINT,
  implied_vol NUMERIC(10,4),
  delta NUMERIC(10,6),
  gamma NUMERIC(10,6),
  theta NUMERIC(10,6),
  vega NUMERIC(10,6),
  fetched_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (symbol, expiry, strike, option_type)
);

CREATE INDEX IF NOT EXISTS idx_options_chain_symbol ON options_chain_latest(symbol);
CREATE INDEX IF NOT EXISTS idx_options_chain_expiry ON options_chain_latest(expiry);

-- -----------------------------------------------------------------------------
-- 6. Options Metrics (Aggregated per Symbol)
-- -----------------------------------------------------------------------------
-- Pre-computed options metrics for confluence scoring
CREATE TABLE IF NOT EXISTS options_metrics_latest (
  symbol VARCHAR(20) PRIMARY KEY,
  pcr NUMERIC(10,4), -- Put/Call Ratio
  pcr_oi NUMERIC(10,4), -- PCR by Open Interest
  total_call_volume BIGINT,
  total_put_volume BIGINT,
  total_call_oi BIGINT,
  total_put_oi BIGINT,
  max_pain NUMERIC(12,4),
  iv_rank INT, -- 0-100
  iv_percentile INT, -- 0-100
  liquidity_score INT, -- 0-100
  fmv_deviation_bps INT, -- FMV vs mid deviation in basis points
  nearest_expiry DATE,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 7. Scanner Results (Cached)
-- -----------------------------------------------------------------------------
-- Store scanner outputs so all users get same results instantly
CREATE TABLE IF NOT EXISTS scanner_results_cache (
  scanner_name VARCHAR(50) NOT NULL, -- e.g., 'squeeze', 'momentum', 'confluence'
  universe VARCHAR(50) NOT NULL, -- e.g., 'sp500', 'crypto', 'watchlist'
  timeframe VARCHAR(10) NOT NULL DEFAULT 'daily',
  results JSONB NOT NULL,
  total_symbols INT,
  matches_found INT,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scanner_name, universe, timeframe)
);

CREATE INDEX IF NOT EXISTS idx_scanner_results_computed ON scanner_results_cache(computed_at);

-- -----------------------------------------------------------------------------
-- 8. Worker Run Log
-- -----------------------------------------------------------------------------
-- Track worker runs for debugging and monitoring
CREATE TABLE IF NOT EXISTS worker_runs (
  id SERIAL PRIMARY KEY,
  worker_name VARCHAR(50) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  symbols_processed INT DEFAULT 0,
  api_calls_made INT DEFAULT 0,
  errors_count INT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'running', -- running, completed, failed
  error_message TEXT,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_worker_runs_name_status ON worker_runs(worker_name, status);
CREATE INDEX IF NOT EXISTS idx_worker_runs_started ON worker_runs(started_at);

-- -----------------------------------------------------------------------------
-- 9. Helper Functions
-- -----------------------------------------------------------------------------

-- Function to clean old OHLCV bars (keep last N per symbol/timeframe)
CREATE OR REPLACE FUNCTION cleanup_old_bars(max_bars INT DEFAULT 500)
RETURNS INT AS $$
DECLARE
  deleted_count INT;
BEGIN
  WITH ranked AS (
    SELECT symbol, timeframe, ts,
           ROW_NUMBER() OVER (PARTITION BY symbol, timeframe ORDER BY ts DESC) as rn
    FROM ohlcv_bars
  ),
  to_delete AS (
    SELECT symbol, timeframe, ts FROM ranked WHERE rn > max_bars
  )
  DELETE FROM ohlcv_bars
  WHERE (symbol, timeframe, ts) IN (SELECT symbol, timeframe, ts FROM to_delete);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get stale symbols (not fetched recently)
CREATE OR REPLACE FUNCTION get_stale_symbols(stale_minutes INT DEFAULT 5)
RETURNS TABLE(symbol VARCHAR(20), tier SMALLINT, asset_type VARCHAR(20)) AS $$
BEGIN
  RETURN QUERY
  SELECT su.symbol, su.tier, su.asset_type
  FROM symbol_universe su
  WHERE su.enabled = TRUE
    AND (su.last_fetched_at IS NULL 
         OR su.last_fetched_at < NOW() - (stale_minutes || ' minutes')::INTERVAL)
  ORDER BY su.tier ASC, su.last_fetched_at ASC NULLS FIRST;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 10. Insert Default Symbol Universe
-- -----------------------------------------------------------------------------
-- Popular equities (Tier 1 = fast refresh)
INSERT INTO symbol_universe (symbol, asset_type, name, tier) VALUES
  ('SPY', 'equity', 'SPDR S&P 500 ETF', 1),
  ('QQQ', 'equity', 'Invesco QQQ Trust', 1),
  ('NVDA', 'equity', 'NVIDIA Corporation', 1),
  ('AAPL', 'equity', 'Apple Inc', 1),
  ('TSLA', 'equity', 'Tesla Inc', 1),
  ('MSFT', 'equity', 'Microsoft Corporation', 1),
  ('AMD', 'equity', 'Advanced Micro Devices', 1),
  ('AMZN', 'equity', 'Amazon.com Inc', 1),
  ('META', 'equity', 'Meta Platforms Inc', 1),
  ('GOOGL', 'equity', 'Alphabet Inc', 1)
ON CONFLICT (symbol) DO UPDATE SET name = EXCLUDED.name, tier = EXCLUDED.tier;

-- Popular crypto (Tier 1)
INSERT INTO symbol_universe (symbol, asset_type, name, tier) VALUES
  ('BTC', 'crypto', 'Bitcoin', 1),
  ('ETH', 'crypto', 'Ethereum', 1),
  ('SOL', 'crypto', 'Solana', 1),
  ('XRP', 'crypto', 'Ripple', 2),
  ('DOGE', 'crypto', 'Dogecoin', 2),
  ('ADA', 'crypto', 'Cardano', 2)
ON CONFLICT (symbol) DO UPDATE SET name = EXCLUDED.name, tier = EXCLUDED.tier;

-- Forex pairs (Tier 2 = standard refresh)
INSERT INTO symbol_universe (symbol, asset_type, name, tier) VALUES
  ('EURUSD', 'forex', 'Euro/US Dollar', 2),
  ('GBPUSD', 'forex', 'British Pound/US Dollar', 2),
  ('USDJPY', 'forex', 'US Dollar/Japanese Yen', 2),
  ('AUDUSD', 'forex', 'Australian Dollar/US Dollar', 2)
ON CONFLICT (symbol) DO UPDATE SET name = EXCLUDED.name, tier = EXCLUDED.tier;

-- Additional popular equities (Tier 2)
INSERT INTO symbol_universe (symbol, asset_type, name, tier) VALUES
  ('IWM', 'equity', 'iShares Russell 2000 ETF', 2),
  ('DIA', 'equity', 'SPDR Dow Jones ETF', 2),
  ('NFLX', 'equity', 'Netflix Inc', 2),
  ('JPM', 'equity', 'JPMorgan Chase', 2),
  ('V', 'equity', 'Visa Inc', 2),
  ('BA', 'equity', 'Boeing Company', 2),
  ('DIS', 'equity', 'Walt Disney Co', 2),
  ('COIN', 'equity', 'Coinbase Global', 2),
  ('PLTR', 'equity', 'Palantir Technologies', 2),
  ('SOFI', 'equity', 'SoFi Technologies', 2)
ON CONFLICT (symbol) DO UPDATE SET name = EXCLUDED.name, tier = EXCLUDED.tier;

-- -----------------------------------------------------------------------------
-- Done! Run this migration in your Neon SQL console
-- -----------------------------------------------------------------------------
