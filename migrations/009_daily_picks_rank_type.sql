-- Migration: Add rank_type column to daily_picks for top/bottom distinction
-- This supports showing both bullish opportunities (top) and bearish opportunities (bottom)

ALTER TABLE daily_picks ADD COLUMN IF NOT EXISTS rank_type VARCHAR(10) DEFAULT 'top';

-- Add index for rank_type queries
CREATE INDEX IF NOT EXISTS idx_daily_picks_rank ON daily_picks(scan_date, asset_class, rank_type, score DESC);

-- Update the signals column to use JSONB for more flexibility
ALTER TABLE daily_picks ADD COLUMN IF NOT EXISTS signals JSONB;

-- Comment: The new scan-universe job stores signals as JSON object {bullish, bearish, neutral}
-- while keeping the individual signals_bullish, signals_bearish, signals_neutral columns for backward compat
