-- FIX: Multi-Condition Alerts Schema
-- Run this in Neon PostgreSQL console if you get "column is_multi_condition does not exist" error

-- Step 1: Add missing columns to alerts table (each in separate statement)
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

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='alerts' AND column_name='parent_alert_id') THEN
        ALTER TABLE alerts ADD COLUMN parent_alert_id UUID REFERENCES alerts(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Step 2: Create alert_conditions table if not exists
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

-- Step 3: Create indexes
CREATE INDEX IF NOT EXISTS idx_alert_conditions_alert ON alert_conditions(alert_id);
CREATE INDEX IF NOT EXISTS idx_alert_conditions_type ON alert_conditions(condition_type);

-- Verify columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'alerts' 
AND column_name IN ('is_multi_condition', 'condition_logic', 'parent_alert_id');
