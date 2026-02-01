-- Referral System Tables
-- Run this migration to enable the referral program

-- Table to store user referral codes
CREATE TABLE IF NOT EXISTS referrals (
    id SERIAL PRIMARY KEY,
    workspace_id UUID NOT NULL UNIQUE,
    referral_code VARCHAR(16) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT fk_workspace FOREIGN KEY (workspace_id) 
        REFERENCES workspaces(id) ON DELETE CASCADE
);

-- Index for fast code lookups
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referral_code);

-- Table to track referral signups and rewards
CREATE TABLE IF NOT EXISTS referral_signups (
    id SERIAL PRIMARY KEY,
    referrer_workspace_id UUID NOT NULL,
    referee_workspace_id UUID NOT NULL,
    referee_email VARCHAR(255),
    referral_code VARCHAR(16) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- pending: signed up but no paid subscription yet
    -- completed: paid subscription activated, ready for reward
    -- rewarded: both users have received their Pro Trader month
    -- expired: referral expired (no subscription within 30 days)
    reward_applied_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT fk_referrer FOREIGN KEY (referrer_workspace_id) 
        REFERENCES workspaces(id) ON DELETE CASCADE,
    CONSTRAINT fk_referee FOREIGN KEY (referee_workspace_id) 
        REFERENCES workspaces(id) ON DELETE CASCADE,
    CONSTRAINT unique_referee UNIQUE (referee_workspace_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_referral_signups_referrer ON referral_signups(referrer_workspace_id);
CREATE INDEX IF NOT EXISTS idx_referral_signups_status ON referral_signups(status);
CREATE INDEX IF NOT EXISTS idx_referral_signups_code ON referral_signups(referral_code);

-- Table to track referral rewards applied
CREATE TABLE IF NOT EXISTS referral_rewards (
    id SERIAL PRIMARY KEY,
    workspace_id UUID NOT NULL,
    referral_signup_id INTEGER NOT NULL,
    reward_type VARCHAR(50) NOT NULL, -- 'pro_trader_month'
    stripe_coupon_id VARCHAR(255),
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT fk_workspace_reward FOREIGN KEY (workspace_id) 
        REFERENCES workspaces(id) ON DELETE CASCADE,
    CONSTRAINT fk_referral_signup FOREIGN KEY (referral_signup_id) 
        REFERENCES referral_signups(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_workspace ON referral_rewards(workspace_id);

-- Comments
COMMENT ON TABLE referrals IS 'Stores unique referral codes for each user';
COMMENT ON TABLE referral_signups IS 'Tracks when someone signs up via a referral link';
COMMENT ON TABLE referral_rewards IS 'Tracks when referral rewards are applied';
COMMENT ON COLUMN referral_signups.status IS 'pending=waiting for paid sub, completed=paid and reward pending, rewarded=done, expired=no sub within 30 days';
