/**
 * Timeframe Midpoints Schema
 * 
 * Stores the 50% midpoint of every closed candle across all timeframes.
 * This is the foundation data for the Time Gravity Map system.
 */

-- ============================================================================
-- MIDPOINTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS timeframe_midpoints (
  id BIGSERIAL PRIMARY KEY,
  
  -- Symbol & Market
  symbol VARCHAR(20) NOT NULL,
  asset_type VARCHAR(20) NOT NULL DEFAULT 'crypto', -- 'crypto', 'stock', 'forex', 'options'
  
  -- Timeframe
  timeframe VARCHAR(10) NOT NULL, -- '1H', '4H', '1D', '1W', '1M', etc.
  
  -- Candle Data
  candle_open_time TIMESTAMPTZ NOT NULL,
  candle_close_time TIMESTAMPTZ NOT NULL,
  high DECIMAL(20,8) NOT NULL,
  low DECIMAL(20,8) NOT NULL,
  midpoint DECIMAL(20,8) NOT NULL, -- Calculated as (high + low) / 2
  open_price DECIMAL(20,8),
  close_price DECIMAL(20,8),
  volume DECIMAL(20,8),
  
  -- Tagging Status
  tagged BOOLEAN DEFAULT FALSE,
  tagged_at TIMESTAMPTZ,
  tagged_price DECIMAL(20,8),
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent duplicates
  CONSTRAINT unique_midpoint UNIQUE (symbol, timeframe, candle_close_time)
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Query by symbol and timeframe (most common)
CREATE INDEX IF NOT EXISTS idx_midpoints_symbol_tf 
  ON timeframe_midpoints(symbol, timeframe, candle_close_time DESC);

-- Query untagged midpoints (for Time Gravity Map)
CREATE INDEX IF NOT EXISTS idx_midpoints_untagged 
  ON timeframe_midpoints(symbol, timeframe, tagged) 
  WHERE tagged = FALSE;

-- Query by time range
CREATE INDEX IF NOT EXISTS idx_midpoints_time 
  ON timeframe_midpoints(candle_close_time DESC);

-- Query by asset type
CREATE INDEX IF NOT EXISTS idx_midpoints_asset_type 
  ON timeframe_midpoints(asset_type, symbol);

-- ============================================================================
-- AUTOMATIC TIMESTAMP UPDATE
-- ============================================================================

CREATE OR REPLACE FUNCTION update_midpoints_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_midpoints_timestamp
  BEFORE UPDATE ON timeframe_midpoints
  FOR EACH ROW
  EXECUTE FUNCTION update_midpoints_updated_at();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

/**
 * Get untagged midpoints for a symbol within distance threshold
 */
CREATE OR REPLACE FUNCTION get_nearby_untagged_midpoints(
  p_symbol VARCHAR(20),
  p_current_price DECIMAL(20,8),
  p_max_distance_percent DECIMAL(5,2) DEFAULT 5.0,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id BIGINT,
  timeframe VARCHAR(10),
  midpoint DECIMAL(20,8),
  high DECIMAL(20,8),
  low DECIMAL(20,8),
  candle_open_time TIMESTAMPTZ,
  candle_close_time TIMESTAMPTZ,
  distance_percent DECIMAL(10,4),
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tm.id,
    tm.timeframe,
    tm.midpoint,
    tm.high,
    tm.low,
    tm.candle_open_time,
    tm.candle_close_time,
    ABS((tm.midpoint - p_current_price) / p_current_price * 100) as distance_percent,
    tm.created_at
  FROM timeframe_midpoints tm
  WHERE 
    tm.symbol = p_symbol
    AND tm.tagged = FALSE
    AND ABS((tm.midpoint - p_current_price) / p_current_price * 100) <= p_max_distance_percent
  ORDER BY 
    ABS((tm.midpoint - p_current_price) / p_current_price * 100) ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

/**
 * Mark midpoint as tagged when price reaches it
 */
CREATE OR REPLACE FUNCTION tag_midpoint(
  p_id BIGINT,
  p_tagged_price DECIMAL(20,8)
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE timeframe_midpoints
  SET 
    tagged = TRUE,
    tagged_at = NOW(),
    tagged_price = p_tagged_price,
    updated_at = NOW()
  WHERE id = p_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

/**
 * Bulk tag midpoints that price has crossed
 */
CREATE OR REPLACE FUNCTION check_and_tag_midpoints(
  p_symbol VARCHAR(20),
  p_current_high DECIMAL(20,8),
  p_current_low DECIMAL(20,8)
)
RETURNS INT AS $$
DECLARE
  v_tagged_count INT;
BEGIN
  -- Tag any untagged midpoints that fall within current price range
  WITH tagged AS (
    UPDATE timeframe_midpoints
    SET 
      tagged = TRUE,
      tagged_at = NOW(),
      tagged_price = midpoint, -- Price touched the midpoint
      updated_at = NOW()
    WHERE 
      symbol = p_symbol
      AND tagged = FALSE
      AND midpoint >= p_current_low
      AND midpoint <= p_current_high
    RETURNING id
  )
  SELECT COUNT(*) INTO v_tagged_count FROM tagged;
  
  RETURN v_tagged_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STATS VIEW
-- ============================================================================

CREATE OR REPLACE VIEW midpoint_stats AS
SELECT 
  symbol,
  timeframe,
  COUNT(*) as total_midpoints,
  COUNT(*) FILTER (WHERE tagged = FALSE) as untagged,
  COUNT(*) FILTER (WHERE tagged = TRUE) as tagged,
  ROUND(
    (COUNT(*) FILTER (WHERE tagged = TRUE)::DECIMAL / NULLIF(COUNT(*), 0)) * 100, 
    2
  ) as tagged_percent,
  MAX(candle_close_time) as latest_candle,
  MIN(candle_close_time) as earliest_candle
FROM timeframe_midpoints
GROUP BY symbol, timeframe
ORDER BY symbol, timeframe;

-- Grant permissions (adjust user as needed)
-- GRANT ALL ON timeframe_midpoints TO your_app_user;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO your_app_user;
