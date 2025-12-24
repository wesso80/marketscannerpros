-- COMPLETE ALERTS SYSTEM FIX
-- Run this entire script in your Neon PostgreSQL console

-- 1. Create alert_quotas table (if missing)
CREATE TABLE IF NOT EXISTS alert_quotas (
    workspace_id UUID PRIMARY KEY,
    tier VARCHAR(20) NOT NULL DEFAULT 'free',
    max_alerts INT NOT NULL DEFAULT 3,
    active_alerts INT NOT NULL DEFAULT 0,
    total_triggers_today INT NOT NULL DEFAULT 0,
    last_trigger_reset TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create alert_history table (if missing)
CREATE TABLE IF NOT EXISTS alert_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    alert_id UUID NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    condition_type VARCHAR(50) NOT NULL,
    condition_value DECIMAL(20, 8) NOT NULL,
    triggered_price DECIMAL(20, 8) NOT NULL,
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notification_sent BOOLEAN DEFAULT false,
    notification_type VARCHAR(20),
    user_action VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_alert_history_workspace ON alert_history(workspace_id);
CREATE INDEX IF NOT EXISTS idx_alert_history_alert ON alert_history(alert_id);

-- 3. Add multi-condition columns to alerts table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='alerts' AND column_name='is_multi_condition') THEN
        ALTER TABLE alerts ADD COLUMN is_multi_condition BOOLEAN DEFAULT false;
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='alerts' AND column_name='condition_logic') THEN
        ALTER TABLE alerts ADD COLUMN condition_logic VARCHAR(10) DEFAULT 'AND';
    END IF;
END $$;

-- 4. Create alert_conditions table (for multi-condition alerts)
CREATE TABLE IF NOT EXISTS alert_conditions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    condition_type VARCHAR(50) NOT NULL,
    condition_value DECIMAL(20, 8) NOT NULL,
    condition_timeframe VARCHAR(10),
    condition_indicator VARCHAR(20),
    condition_period INT,
    is_met BOOLEAN DEFAULT false,
    last_checked_at TIMESTAMPTZ,
    last_value DECIMAL(20, 8),
    condition_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_conditions_alert ON alert_conditions(alert_id);
CREATE INDEX IF NOT EXISTS idx_alert_conditions_type ON alert_conditions(condition_type);

-- 5. Verify everything exists
SELECT 'Tables check:' as info;
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('alerts', 'alert_quotas', 'alert_history', 'alert_conditions');

SELECT 'Columns check:' as info;
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'alerts' 
AND column_name IN ('is_multi_condition', 'condition_logic');
