-- Daily Market Focus tables (read by the admin Morning Brief; written by the daily-market-focus job).
-- Moved here from the retired /api/migrations/market-focus route. Safe to run more than once.

CREATE TABLE IF NOT EXISTS daily_market_focus (
  id SERIAL PRIMARY KEY,
  focus_date DATE NOT NULL UNIQUE,
  date_key DATE,
  status VARCHAR(20) DEFAULT 'pending',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  notes TEXT,
  model_version VARCHAR(50) DEFAULT 'v1.0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Columns added after the first version of the table.
ALTER TABLE daily_market_focus ADD COLUMN IF NOT EXISTS date_key DATE;
ALTER TABLE daily_market_focus ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE daily_market_focus ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE daily_market_focus ADD COLUMN IF NOT EXISTS notes TEXT;
UPDATE daily_market_focus SET date_key = focus_date WHERE date_key IS NULL;

CREATE TABLE IF NOT EXISTS daily_market_focus_items (
  id SERIAL PRIMARY KEY,
  focus_id INTEGER NOT NULL REFERENCES daily_market_focus(id) ON DELETE CASCADE,
  symbol VARCHAR(20) NOT NULL,
  asset_class VARCHAR(20) NOT NULL,
  score DECIMAL(5,2) NOT NULL,
  phase VARCHAR(50),
  structure VARCHAR(50),
  risk_level VARCHAR(20),
  price DECIMAL(18,8),
  change_percent DECIMAL(8,4),
  rsi DECIMAL(6,2),
  macd_histogram DECIMAL(18,8),
  atr DECIMAL(18,8),
  ai_explanation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_focus_date ON daily_market_focus(focus_date DESC);
CREATE INDEX IF NOT EXISTS idx_market_focus_items_focus_id ON daily_market_focus_items(focus_id);
