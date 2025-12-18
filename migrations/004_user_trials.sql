-- User Trials Table
-- Allows granting trial access without requiring Stripe payment
-- Run this in your Vercel Postgres console

CREATE TABLE IF NOT EXISTS user_trials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  tier VARCHAR(20) NOT NULL DEFAULT 'pro_trader',
  starts_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  granted_by VARCHAR(255) DEFAULT 'admin',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT valid_tier CHECK (tier IN ('pro', 'pro_trader'))
);

-- Index for fast email lookups
CREATE INDEX IF NOT EXISTS idx_user_trials_email ON user_trials(email);

-- Index for finding active trials
CREATE INDEX IF NOT EXISTS idx_user_trials_expires ON user_trials(expires_at);

-- Unique constraint to prevent duplicate active trials for same email
-- (allows multiple historical records, but query should check expires_at > NOW())
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_trials_active 
  ON user_trials(email) 
  WHERE expires_at > NOW();

-- Example: Grant a 30-day Pro Trader trial
-- INSERT INTO user_trials (email, tier, expires_at, granted_by, notes)
-- VALUES ('user@example.com', 'pro_trader', NOW() + INTERVAL '30 days', 'admin', 'Early access partner');
