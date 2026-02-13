-- =============================================================================
-- MSP Signal Learning Schema (Normalized Design)
-- Enables AI learning through proper signal tracking and outcome labeling
-- 
-- Design principles:
-- 1. Immutable event log (signals_fired) - what we predicted
-- 2. Normalized outcomes (signal_outcomes) - one row per horizon
-- 3. Configurable thresholds - rules can change without migrations
-- 4. Versioning - track scanner changes over time
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Signals Fired (Event Log)
-- -----------------------------------------------------------------------------
-- Immutable record of every scanner signal - the "ground truth" of predictions
CREATE TABLE IF NOT EXISTS signals_fired (
  id BIGSERIAL PRIMARY KEY,
  
  -- Signal identification
  symbol VARCHAR(20) NOT NULL,
  signal_type VARCHAR(50) NOT NULL,  -- 'squeeze', 'momentum', 'confluence', 'macd_cross'
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('bullish', 'bearish')),
  score INT NOT NULL CHECK (score BETWEEN 0 AND 100),
  
  -- Price & time at signal
  signal_at TIMESTAMPTZ NOT NULL,
  price_at_signal NUMERIC(18,8) NOT NULL,
  
  -- Context
  timeframe VARCHAR(10) NOT NULL DEFAULT 'daily',  -- '15m', '1h', '4h', 'daily'
  features_json JSONB,                -- Snapshot of indicators at signal time
  scanner_version VARCHAR(20),        -- 'v3.0', 'v3.1', etc.
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signals_symbol_time ON signals_fired(symbol, signal_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_type_time ON signals_fired(signal_type, signal_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_direction ON signals_fired(direction, signal_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_score ON signals_fired(score DESC, signal_at DESC);

-- Signal bucket column for deduplication (computed by app code, not database)
-- Bucketing logic: 15m→15min, 1h→hour, 4h→4hours, daily→day
ALTER TABLE signals_fired ADD COLUMN IF NOT EXISTS signal_bucket TIMESTAMPTZ;

-- Index for time-window queries on buckets
CREATE INDEX IF NOT EXISTS idx_signals_bucket ON signals_fired(signal_bucket DESC);

-- Proper dedupe: same signal can't fire twice in same bucket
-- Includes direction: a bullish and bearish signal CAN both fire in same bucket
DROP INDEX IF EXISTS idx_signals_dedup;
CREATE UNIQUE INDEX IF NOT EXISTS idx_signals_dedup 
ON signals_fired(symbol, signal_type, direction, timeframe, scanner_version, signal_bucket);

-- -----------------------------------------------------------------------------
-- 2. Signal Outcomes (Many Horizons Per Signal)
-- -----------------------------------------------------------------------------
-- One row per (signal_id, horizon) - scales to any number of time horizons
CREATE TABLE IF NOT EXISTS signal_outcomes (
  id BIGSERIAL PRIMARY KEY,
  signal_id BIGINT NOT NULL REFERENCES signals_fired(id) ON DELETE CASCADE,
  
  -- Horizon definition (in minutes for precision)
  horizon_minutes INT NOT NULL,       -- 60=1h, 240=4h, 1440=1d, 10080=1w
  
  -- Actual results
  price_later NUMERIC(18,8),
  pct_move NUMERIC(10,4),             -- % change from signal price
  
  -- Outcome label (based on threshold rules)
  outcome VARCHAR(20) NOT NULL CHECK (outcome IN ('correct', 'wrong', 'neutral', 'unknown')),
  
  -- Processing metadata
  labeled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(signal_id, horizon_minutes)
);

CREATE INDEX IF NOT EXISTS idx_outcomes_signal ON signal_outcomes(signal_id);
CREATE INDEX IF NOT EXISTS idx_outcomes_horizon ON signal_outcomes(horizon_minutes);
CREATE INDEX IF NOT EXISTS idx_outcomes_result ON signal_outcomes(outcome, horizon_minutes);

-- -----------------------------------------------------------------------------
-- 3. Outcome Threshold Config
-- -----------------------------------------------------------------------------
-- Configurable labeling rules - change without migrations
CREATE TABLE IF NOT EXISTS outcome_thresholds (
  horizon_minutes INT PRIMARY KEY,
  horizon_label VARCHAR(20) NOT NULL,  -- '1h', '4h', '1d', '1w'
  
  -- Thresholds for labeling (as percentages)
  correct_threshold NUMERIC(5,2) NOT NULL,  -- pct_move >= this = correct (bullish)
  wrong_threshold NUMERIC(5,2) NOT NULL,    -- pct_move <= -this = wrong (bullish)
  
  -- For bearish signals, these are inverted
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default thresholds
INSERT INTO outcome_thresholds (horizon_minutes, horizon_label, correct_threshold, wrong_threshold) VALUES
  (60, '1h', 0.5, 0.5),      -- 1 hour: ±0.5%
  (240, '4h', 1.0, 1.0),     -- 4 hours: ±1.0%
  (1440, '1d', 2.0, 2.0),    -- 1 day: ±2.0%
  (10080, '1w', 4.0, 4.0)    -- 1 week: ±4.0%
ON CONFLICT (horizon_minutes) DO UPDATE SET
  correct_threshold = EXCLUDED.correct_threshold,
  wrong_threshold = EXCLUDED.wrong_threshold,
  updated_at = NOW();

-- -----------------------------------------------------------------------------
-- 4. Accuracy Stats (Materialized / Refreshed)
-- -----------------------------------------------------------------------------
-- Pre-computed accuracy by signal_type, direction, horizon, AND scanner_version
-- This ensures you can compare apples-to-apples when scoring/thresholds change
CREATE TABLE IF NOT EXISTS signal_accuracy_stats (
  signal_type VARCHAR(50) NOT NULL,
  direction VARCHAR(10) NOT NULL,
  horizon_minutes INT NOT NULL,
  scanner_version VARCHAR(20) NOT NULL,   -- Track which version generated these stats
  
  -- Counts
  total_signals INT DEFAULT 0,
  labeled_signals INT DEFAULT 0,          -- Signals with known outcomes
  unknown_count INT DEFAULT 0,            -- Signals where price data was missing
  correct_count INT DEFAULT 0,
  wrong_count INT DEFAULT 0,
  neutral_count INT DEFAULT 0,
  
  -- Rates
  accuracy_pct NUMERIC(5,2),          -- correct / (correct + wrong)
  precision_pct NUMERIC(5,2),         -- correct / total
  
  -- Returns (for expectancy calculation)
  avg_pct_when_correct NUMERIC(10,4),
  avg_pct_when_wrong NUMERIC(10,4),
  median_pct_move NUMERIC(10,4),
  
  -- Score bucket analysis
  accuracy_score_0_25 NUMERIC(5,2),
  accuracy_score_26_50 NUMERIC(5,2),
  accuracy_score_51_75 NUMERIC(5,2),
  accuracy_score_76_100 NUMERIC(5,2),
  
  -- Time window
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  PRIMARY KEY (signal_type, direction, horizon_minutes, scanner_version)
);

-- -----------------------------------------------------------------------------
-- 5. Helper Functions
-- -----------------------------------------------------------------------------

-- Function to get signals missing outcomes for a given horizon
CREATE OR REPLACE FUNCTION get_unlabeled_signals(p_horizon_minutes INT, p_limit INT DEFAULT 100)
RETURNS TABLE(
  signal_id BIGINT,
  symbol VARCHAR(20),
  direction VARCHAR(10),
  signal_at TIMESTAMPTZ,
  price_at_signal NUMERIC(18,8)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sf.id,
    sf.symbol,
    sf.direction,
    sf.signal_at,
    sf.price_at_signal
  FROM signals_fired sf
  LEFT JOIN signal_outcomes so ON sf.id = so.signal_id AND so.horizon_minutes = p_horizon_minutes
  WHERE so.id IS NULL
    AND sf.signal_at < NOW() - (p_horizon_minutes || ' minutes')::INTERVAL
  ORDER BY sf.signal_at ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to label an outcome based on thresholds
-- Defensive: returns 'unknown' for NULL inputs or unexpected direction values
CREATE OR REPLACE FUNCTION compute_outcome_label(
  p_direction VARCHAR(10),
  p_pct_move NUMERIC(10,4),
  p_correct_threshold NUMERIC(5,2),
  p_wrong_threshold NUMERIC(5,2)
)
RETURNS VARCHAR(20) AS $$
BEGIN
  -- Defensive NULL checks
  IF p_pct_move IS NULL THEN RETURN 'unknown'; END IF;
  IF p_direction IS NULL OR p_direction NOT IN ('bullish', 'bearish') THEN RETURN 'unknown'; END IF;
  
  IF p_direction = 'bullish' THEN
    IF p_pct_move >= p_correct_threshold THEN RETURN 'correct';
    ELSIF p_pct_move <= -p_wrong_threshold THEN RETURN 'wrong';
    ELSE RETURN 'neutral';
    END IF;
  ELSE -- bearish
    IF p_pct_move <= -p_correct_threshold THEN RETURN 'correct';
    ELSIF p_pct_move >= p_wrong_threshold THEN RETURN 'wrong';
    ELSE RETURN 'neutral';
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to refresh accuracy stats (grouped by scanner_version for regime comparison)
CREATE OR REPLACE FUNCTION refresh_signal_accuracy(p_days INT DEFAULT 90)
RETURNS VOID AS $$
BEGIN
  DELETE FROM signal_accuracy_stats;
  
  INSERT INTO signal_accuracy_stats (
    signal_type, direction, horizon_minutes, scanner_version,
    total_signals, labeled_signals, unknown_count, 
    correct_count, wrong_count, neutral_count,
    accuracy_pct, precision_pct,
    avg_pct_when_correct, avg_pct_when_wrong, median_pct_move,
    accuracy_score_0_25, accuracy_score_26_50, accuracy_score_51_75, accuracy_score_76_100,
    window_start, window_end, computed_at
  )
  SELECT 
    sf.signal_type,
    sf.direction,
    so.horizon_minutes,
    COALESCE(sf.scanner_version, 'unknown'),
    COUNT(DISTINCT sf.id),
    -- Labeled = outcomes that are not 'unknown'
    COUNT(*) FILTER (WHERE so.outcome IN ('correct', 'wrong', 'neutral')),
    COUNT(*) FILTER (WHERE so.outcome = 'unknown'),
    COUNT(*) FILTER (WHERE so.outcome = 'correct'),
    COUNT(*) FILTER (WHERE so.outcome = 'wrong'),
    COUNT(*) FILTER (WHERE so.outcome = 'neutral'),
    -- Accuracy: correct / (correct + wrong), ignoring neutral and unknown
    ROUND(100.0 * COUNT(*) FILTER (WHERE so.outcome = 'correct') / 
          NULLIF(COUNT(*) FILTER (WHERE so.outcome IN ('correct', 'wrong')), 0), 2),
    -- Precision: correct / labeled (excludes unknown)
    ROUND(100.0 * COUNT(*) FILTER (WHERE so.outcome = 'correct') / 
          NULLIF(COUNT(*) FILTER (WHERE so.outcome IN ('correct', 'wrong', 'neutral')), 0), 2),
    -- Avg returns
    AVG(so.pct_move) FILTER (WHERE so.outcome = 'correct'),
    AVG(so.pct_move) FILTER (WHERE so.outcome = 'wrong'),
    -- Median of all known outcomes
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY so.pct_move) FILTER (WHERE so.outcome IN ('correct', 'wrong', 'neutral')),
    -- By score bucket
    ROUND(100.0 * COUNT(*) FILTER (WHERE so.outcome = 'correct' AND sf.score <= 25) / 
          NULLIF(COUNT(*) FILTER (WHERE so.outcome IN ('correct','wrong') AND sf.score <= 25), 0), 2),
    ROUND(100.0 * COUNT(*) FILTER (WHERE so.outcome = 'correct' AND sf.score > 25 AND sf.score <= 50) / 
          NULLIF(COUNT(*) FILTER (WHERE so.outcome IN ('correct','wrong') AND sf.score > 25 AND sf.score <= 50), 0), 2),
    ROUND(100.0 * COUNT(*) FILTER (WHERE so.outcome = 'correct' AND sf.score > 50 AND sf.score <= 75) / 
          NULLIF(COUNT(*) FILTER (WHERE so.outcome IN ('correct','wrong') AND sf.score > 50 AND sf.score <= 75), 0), 2),
    ROUND(100.0 * COUNT(*) FILTER (WHERE so.outcome = 'correct' AND sf.score > 75) / 
          NULLIF(COUNT(*) FILTER (WHERE so.outcome IN ('correct','wrong') AND sf.score > 75), 0), 2),
    -- Window
    MIN(sf.signal_at),
    MAX(sf.signal_at),
    NOW()
  FROM signals_fired sf
  JOIN signal_outcomes so ON sf.id = so.signal_id
  WHERE sf.signal_at > NOW() - (p_days || ' days')::INTERVAL
  GROUP BY sf.signal_type, sf.direction, so.horizon_minutes, sf.scanner_version;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 6. Win Rate Dashboard Query (for reference)
-- -----------------------------------------------------------------------------
-- This query shows signal performance by type and horizon
-- Usage: Run after refresh_signal_accuracy()
/*
SELECT 
  signal_type,
  direction,
  ot.horizon_label,
  total_signals,
  accuracy_pct as win_rate,
  avg_pct_when_correct as avg_win,
  avg_pct_when_wrong as avg_loss,
  CASE WHEN avg_pct_when_wrong != 0 
       THEN ROUND(ABS(avg_pct_when_correct / avg_pct_when_wrong), 2) 
       ELSE NULL END as risk_reward,
  accuracy_score_76_100 as high_score_winrate
FROM signal_accuracy_stats sas
JOIN outcome_thresholds ot ON sas.horizon_minutes = ot.horizon_minutes
ORDER BY signal_type, horizon_minutes;
*/

-- -----------------------------------------------------------------------------
-- 7. Journal Entry → Signal Linking
-- -----------------------------------------------------------------------------
-- Add signal_id to journal_entries so users can link trades to signals
-- This enables: "What signals do I trade well vs poorly?"
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'journal_entries' AND column_name = 'signal_id'
  ) THEN
    ALTER TABLE journal_entries ADD COLUMN signal_id BIGINT REFERENCES signals_fired(id);
    CREATE INDEX idx_journal_signal ON journal_entries(signal_id) WHERE signal_id IS NOT NULL;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Done! Run this migration in Neon SQL Editor
-- -----------------------------------------------------------------------------
