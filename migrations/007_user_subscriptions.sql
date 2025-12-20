-- User Subscriptions table (updated schema)
-- Run this SQL in your Neon database

-- Drop old table if it has different schema (optional - only if you want fresh start)
-- DROP TABLE IF EXISTS user_subscriptions;

CREATE TABLE IF NOT EXISTS user_subscriptions (
    id SERIAL PRIMARY KEY,
    workspace_id VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255),
    tier VARCHAR(50) NOT NULL DEFAULT 'free',  -- free, pro, pro_trader
    status VARCHAR(50) NOT NULL DEFAULT 'active',  -- active, trialing, past_due, canceled
    stripe_customer_id VARCHAR(100),
    stripe_subscription_id VARCHAR(100),
    current_period_end TIMESTAMP,
    is_trial BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_user_subs_tier ON user_subscriptions (tier);
CREATE INDEX IF NOT EXISTS idx_user_subs_status ON user_subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_user_subs_email ON user_subscriptions (email);
CREATE INDEX IF NOT EXISTS idx_user_subs_created ON user_subscriptions (created_at);

-- Add columns if table already exists (safe to run multiple times)
DO $$ 
BEGIN
    -- Add email column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'user_subscriptions' AND column_name = 'email') THEN
        ALTER TABLE user_subscriptions ADD COLUMN email VARCHAR(255);
    END IF;
    
    -- Add is_trial column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'user_subscriptions' AND column_name = 'is_trial') THEN
        ALTER TABLE user_subscriptions ADD COLUMN is_trial BOOLEAN DEFAULT FALSE;
    END IF;
    
    -- Add updated_at column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'user_subscriptions' AND column_name = 'updated_at') THEN
        ALTER TABLE user_subscriptions ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
    END IF;
END $$;
