-- Smart Alerts System Schema Extension
-- Adds AI/derivatives-based alert conditions
-- Run this migration in Neon PostgreSQL console

-- Add new condition types to alerts table
ALTER TABLE alerts 
DROP CONSTRAINT IF EXISTS valid_condition_type;

ALTER TABLE alerts 
ADD CONSTRAINT valid_condition_type CHECK (
    condition_type IN (
        -- Price-based (existing)
        'price_above', 
        'price_below', 
        'percent_change_up', 
        'percent_change_down', 
        'volume_spike',
        -- Smart/Derivatives alerts (new)
        'oi_surge',           -- Open Interest spike >X%
        'oi_drop',            -- Open Interest drop >X%
        'funding_extreme_pos', -- Funding rate above threshold (overleveraged longs)
        'funding_extreme_neg', -- Funding rate below threshold (overleveraged shorts)
        'ls_ratio_high',       -- Long/Short ratio above threshold (crowded longs)
        'ls_ratio_low',        -- Long/Short ratio below threshold (crowded shorts)
        'fear_extreme',        -- Fear & Greed Index < 25
        'greed_extreme',       -- Fear & Greed Index > 75
        'liquidation_cascade', -- Large liquidations detected
        'oi_divergence_bull',  -- OI up + Price down (smart money accumulating)
        'oi_divergence_bear'   -- OI down + Price up (distribution)
    )
);

-- Add smart alert specific columns
ALTER TABLE alerts 
ADD COLUMN IF NOT EXISTS is_smart_alert BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS smart_alert_context JSONB,
ADD COLUMN IF NOT EXISTS last_derivative_value DECIMAL(20, 8),
ADD COLUMN IF NOT EXISTS cooldown_minutes INT DEFAULT 60; -- Prevent spam

-- Smart alerts tracking table
CREATE TABLE IF NOT EXISTS smart_alert_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Market-wide data
    total_oi_btc DECIMAL(20, 2),
    total_oi_usd DECIMAL(20, 2),
    oi_change_24h DECIMAL(10, 4),
    
    -- BTC specific
    btc_oi DECIMAL(20, 2),
    btc_oi_change DECIMAL(10, 4),
    btc_funding_rate DECIMAL(10, 6),
    btc_ls_ratio DECIMAL(10, 4),
    
    -- ETH specific  
    eth_oi DECIMAL(20, 2),
    eth_oi_change DECIMAL(10, 4),
    eth_funding_rate DECIMAL(10, 6),
    eth_ls_ratio DECIMAL(10, 4),
    
    -- Market sentiment
    fear_greed_value INT,
    fear_greed_class VARCHAR(20),
    
    -- Aggregates
    avg_funding_rate DECIMAL(10, 6),
    avg_ls_ratio DECIMAL(10, 4),
    
    -- Raw data for debugging
    raw_data JSONB
);

-- Index for time-series queries
CREATE INDEX IF NOT EXISTS idx_smart_snapshots_time ON smart_alert_snapshots(captured_at DESC);

-- Keep only 7 days of snapshots (cleanup query to run periodically)
-- DELETE FROM smart_alert_snapshots WHERE captured_at < NOW() - INTERVAL '7 days';

-- Comments
COMMENT ON TABLE smart_alert_snapshots IS 'Historical derivatives data for smart alert trend analysis';
COMMENT ON COLUMN alerts.is_smart_alert IS 'True for AI/derivatives-based alerts vs simple price alerts';
COMMENT ON COLUMN alerts.cooldown_minutes IS 'Minimum time between repeated triggers for same alert';
