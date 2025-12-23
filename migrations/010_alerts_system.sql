-- Price Alerts System Schema
-- Run this migration in Neon PostgreSQL console

-- Alerts table - stores user-defined alerts
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    
    -- Alert target
    symbol VARCHAR(20) NOT NULL,
    asset_type VARCHAR(20) NOT NULL DEFAULT 'crypto', -- crypto, equity, forex
    
    -- Condition
    condition_type VARCHAR(30) NOT NULL, -- price_above, price_below, percent_change, volume_spike
    condition_value DECIMAL(20, 8) NOT NULL,
    condition_timeframe VARCHAR(10), -- for percent_change: 1h, 4h, 24h
    
    -- Alert settings
    name VARCHAR(100),
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_recurring BOOLEAN NOT NULL DEFAULT false, -- Re-arm after trigger
    notify_email BOOLEAN NOT NULL DEFAULT false,
    notify_push BOOLEAN NOT NULL DEFAULT true,
    
    -- Status tracking
    triggered_at TIMESTAMPTZ,
    trigger_count INT NOT NULL DEFAULT 0,
    last_checked_at TIMESTAMPTZ,
    last_price DECIMAL(20, 8),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ, -- Optional expiration
    
    -- Constraints
    CONSTRAINT valid_condition_type CHECK (condition_type IN ('price_above', 'price_below', 'percent_change_up', 'percent_change_down', 'volume_spike')),
    CONSTRAINT valid_asset_type CHECK (asset_type IN ('crypto', 'equity', 'forex', 'commodity'))
);

-- Index for fast workspace lookups
CREATE INDEX IF NOT EXISTS idx_alerts_workspace ON alerts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts(workspace_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_alerts_symbol ON alerts(symbol, is_active) WHERE is_active = true;

-- Alert trigger history - records when alerts fired
CREATE TABLE IF NOT EXISTS alert_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL,
    
    -- Trigger details
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trigger_price DECIMAL(20, 8) NOT NULL,
    condition_met VARCHAR(100) NOT NULL, -- Human readable: "BTC crossed above $50,000"
    
    -- Context at trigger time
    symbol VARCHAR(20) NOT NULL,
    condition_type VARCHAR(30) NOT NULL,
    condition_value DECIMAL(20, 8) NOT NULL,
    
    -- Notification status
    notification_sent BOOLEAN NOT NULL DEFAULT false,
    notification_sent_at TIMESTAMPTZ,
    notification_channel VARCHAR(20), -- email, push, both
    
    -- User response
    acknowledged_at TIMESTAMPTZ,
    user_action VARCHAR(50) -- dismissed, snoozed, traded
);

-- Index for history queries
CREATE INDEX IF NOT EXISTS idx_alert_history_workspace ON alert_history(workspace_id);
CREATE INDEX IF NOT EXISTS idx_alert_history_alert ON alert_history(alert_id);
CREATE INDEX IF NOT EXISTS idx_alert_history_recent ON alert_history(workspace_id, triggered_at DESC);

-- Alert quota tracking (per tier)
CREATE TABLE IF NOT EXISTS alert_quotas (
    workspace_id UUID PRIMARY KEY,
    tier VARCHAR(20) NOT NULL DEFAULT 'free',
    max_alerts INT NOT NULL DEFAULT 3, -- free: 3, pro: 25, pro_trader: unlimited
    active_alerts INT NOT NULL DEFAULT 0,
    total_triggers_today INT NOT NULL DEFAULT 0,
    last_trigger_reset TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS alerts_updated_at ON alerts;
CREATE TRIGGER alerts_updated_at
    BEFORE UPDATE ON alerts
    FOR EACH ROW
    EXECUTE FUNCTION update_alerts_updated_at();

-- Helpful views
CREATE OR REPLACE VIEW active_alerts_summary AS
SELECT 
    workspace_id,
    COUNT(*) as total_alerts,
    COUNT(*) FILTER (WHERE is_active) as active_alerts,
    COUNT(*) FILTER (WHERE triggered_at IS NOT NULL) as triggered_alerts,
    COUNT(*) FILTER (WHERE asset_type = 'crypto') as crypto_alerts,
    COUNT(*) FILTER (WHERE asset_type = 'equity') as stock_alerts
FROM alerts
GROUP BY workspace_id;

-- Comments for documentation
COMMENT ON TABLE alerts IS 'User-defined price alerts with conditions and notification settings';
COMMENT ON TABLE alert_history IS 'Historical record of triggered alerts';
COMMENT ON TABLE alert_quotas IS 'Per-workspace alert limits based on subscription tier';
COMMENT ON COLUMN alerts.condition_type IS 'price_above, price_below, percent_change_up, percent_change_down, volume_spike';
COMMENT ON COLUMN alerts.is_recurring IS 'If true, alert re-arms after triggering instead of deactivating';
