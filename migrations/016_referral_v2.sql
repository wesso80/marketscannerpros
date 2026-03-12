-- Referral System V2: Credits + Contest + Click Tracking
-- Upgrades the referral program from "1 month Pro Trader" to "$20 Stripe balance credit"
-- Adds click tracking, contest draw entries, and anti-abuse columns

-- 1. Click tracking for analytics + anti-abuse
CREATE TABLE IF NOT EXISTS referral_clicks (
    id SERIAL PRIMARY KEY,
    referral_code VARCHAR(16) NOT NULL,
    ip_hash VARCHAR(64),
    user_agent_hash VARCHAR(64),
    landing_page VARCHAR(255) DEFAULT '/pricing',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_referral_clicks_code ON referral_clicks(referral_code);
CREATE INDEX IF NOT EXISTS idx_referral_clicks_created ON referral_clicks(created_at);

-- 2. Contest entries (5 qualifying referrals = 1 draw entry)
CREATE TABLE IF NOT EXISTS contest_entries (
    id SERIAL PRIMARY KEY,
    workspace_id UUID NOT NULL,
    contest_period VARCHAR(20) NOT NULL,  -- e.g. '2026-03'
    entry_number INTEGER NOT NULL DEFAULT 1,
    qualifying_referral_ids INTEGER[] NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT fk_contest_workspace FOREIGN KEY (workspace_id)
        REFERENCES workspaces(id) ON DELETE CASCADE,
    CONSTRAINT unique_contest_entry UNIQUE (workspace_id, contest_period, entry_number)
);
CREATE INDEX IF NOT EXISTS idx_contest_entries_period ON contest_entries(contest_period);

-- 3. Extend referral_rewards for credit model
ALTER TABLE referral_rewards
    ADD COLUMN IF NOT EXISTS credit_amount_cents INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS stripe_balance_txn_id VARCHAR(255);

-- 4. Extend referral_signups with conversion tracking + anti-abuse
ALTER TABLE referral_signups
    ADD COLUMN IF NOT EXISTS converted_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS referee_plan VARCHAR(20),
    ADD COLUMN IF NOT EXISTS ip_hash VARCHAR(64);

COMMENT ON TABLE referral_clicks IS 'Tracks pricing page visits via referral link for analytics and abuse detection';
COMMENT ON TABLE contest_entries IS 'Every 5 qualifying referrals earns 1 entry in the monthly $500 draw';
COMMENT ON COLUMN referral_rewards.credit_amount_cents IS 'Credit amount in cents (2000 = $20)';
COMMENT ON COLUMN referral_rewards.stripe_balance_txn_id IS 'Stripe CustomerBalanceTransaction ID for audit trail';
