-- Daily Top Picks table for storing pre-computed scanner results
-- Run once daily via cron job

CREATE TABLE IF NOT EXISTS daily_picks (
  id SERIAL PRIMARY KEY,
  asset_class VARCHAR(20) NOT NULL, -- 'equity', 'crypto', 'forex'
  symbol VARCHAR(20) NOT NULL,
  score INTEGER NOT NULL, -- 0-100
  direction VARCHAR(10) NOT NULL, -- 'bullish', 'bearish', 'neutral'
  signals_bullish INTEGER DEFAULT 0,
  signals_bearish INTEGER DEFAULT 0,
  signals_neutral INTEGER DEFAULT 0,
  price DECIMAL(20, 8),
  change_percent DECIMAL(10, 4),
  indicators JSONB, -- Store full indicator data
  scan_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(asset_class, symbol, scan_date)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_daily_picks_date ON daily_picks(scan_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_picks_class_date ON daily_picks(asset_class, scan_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_picks_score ON daily_picks(scan_date, asset_class, score DESC);

-- Clean up old data (keep 30 days)
-- Run periodically: DELETE FROM daily_picks WHERE scan_date < CURRENT_DATE - INTERVAL '30 days';
