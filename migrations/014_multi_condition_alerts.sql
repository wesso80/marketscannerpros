-- Multi-Condition Alerts Schema
-- Allows creating alerts with multiple conditions (AND/OR logic)
-- Run this migration in Neon PostgreSQL console

-- Add multi-condition support to alerts table
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS is_multi_condition BOOLEAN DEFAULT false;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS condition_logic VARCHAR(10) DEFAULT 'AND'; -- AND or OR
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS parent_alert_id UUID REFERENCES alerts(id) ON DELETE CASCADE;

-- Multi-condition alert definitions
-- Each row represents one condition in a multi-condition alert
CREATE TABLE IF NOT EXISTS alert_conditions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    
    -- Condition details
    condition_type VARCHAR(50) NOT NULL,
    -- price_above, price_below, percent_change_up, percent_change_down, volume_spike
    -- rsi_above, rsi_below, macd_cross_up, macd_cross_down
    -- sma_cross_above, sma_cross_below, ema_cross_above, ema_cross_below
    -- oi_above, oi_below, oi_change_up, oi_change_down
    -- funding_above, funding_below
    -- volume_above, volume_below
    
    condition_value DECIMAL(20, 8) NOT NULL,
    condition_timeframe VARCHAR(10), -- 1h, 4h, 24h for percent changes
    condition_indicator VARCHAR(20), -- For technical indicators: RSI, MACD, SMA, EMA
    condition_period INT, -- Indicator period (e.g., RSI 14, SMA 50)
    
    -- Status tracking
    is_met BOOLEAN DEFAULT false,
    last_checked_at TIMESTAMPTZ,
    last_value DECIMAL(20, 8),
    
    -- Ordering
    condition_order INT NOT NULL DEFAULT 0,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_alert_conditions_alert ON alert_conditions(alert_id);
CREATE INDEX IF NOT EXISTS idx_alert_conditions_type ON alert_conditions(condition_type);

-- Add view for multi-condition alerts with their conditions
CREATE OR REPLACE VIEW v_multi_condition_alerts AS
SELECT 
    a.id,
    a.workspace_id,
    a.symbol,
    a.asset_type,
    a.name,
    a.is_active,
    a.is_recurring,
    a.notify_email,
    a.notify_push,
    a.triggered_at,
    a.trigger_count,
    a.created_at,
    a.condition_logic,
    COALESCE(
        json_agg(
            json_build_object(
                'id', ac.id,
                'condition_type', ac.condition_type,
                'condition_value', ac.condition_value,
                'condition_timeframe', ac.condition_timeframe,
                'condition_indicator', ac.condition_indicator,
                'condition_period', ac.condition_period,
                'is_met', ac.is_met,
                'last_value', ac.last_value,
                'condition_order', ac.condition_order
            ) ORDER BY ac.condition_order
        ) FILTER (WHERE ac.id IS NOT NULL),
        '[]'::json
    ) as conditions
FROM alerts a
LEFT JOIN alert_conditions ac ON ac.alert_id = a.id
WHERE a.is_multi_condition = true
GROUP BY a.id;

-- Comment on tables
COMMENT ON TABLE alert_conditions IS 'Individual conditions for multi-condition alerts';
COMMENT ON COLUMN alerts.is_multi_condition IS 'True if this alert uses multiple conditions';
COMMENT ON COLUMN alerts.condition_logic IS 'How to combine conditions: AND (all must be true) or OR (any can be true)';
COMMENT ON COLUMN alert_conditions.condition_indicator IS 'Technical indicator name for indicator-based conditions';
COMMENT ON COLUMN alert_conditions.condition_period IS 'Period for technical indicators (e.g., 14 for RSI)';
