-- ============================================
-- FULL DATABASE SCHEMA FOR NEON POSTGRES
-- MarketScanner Pros - Complete Setup
-- ============================================
-- Run this entire script in your NEW standalone Neon database
-- (console.neon.tech > SQL Editor)
-- ============================================

-- ============================================
-- 1. WORKSPACES (core tenant table)
-- ============================================
CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_customer_id VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspaces_stripe ON workspaces(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_email ON workspaces(email);

-- ============================================
-- 2. USER SUBSCRIPTIONS
-- ============================================
CREATE TABLE IF NOT EXISTS user_subscriptions (
    id SERIAL PRIMARY KEY,
    workspace_id VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255),
    tier VARCHAR(50) NOT NULL DEFAULT 'free',
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    stripe_customer_id VARCHAR(100),
    stripe_subscription_id VARCHAR(100),
    current_period_end TIMESTAMP,
    is_trial BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_subs_tier ON user_subscriptions(tier);
CREATE INDEX IF NOT EXISTS idx_user_subs_status ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_user_subs_email ON user_subscriptions(email);
CREATE INDEX IF NOT EXISTS idx_user_subs_created ON user_subscriptions(created_at);

-- ============================================
-- 3. USER TRIALS
-- ============================================
CREATE TABLE IF NOT EXISTS user_trials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    tier VARCHAR(20) NOT NULL DEFAULT 'pro_trader',
    starts_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    granted_by VARCHAR(255) DEFAULT 'admin',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_tier CHECK (tier IN ('pro', 'pro_trader'))
);

CREATE INDEX IF NOT EXISTS idx_user_trials_email ON user_trials(email);
CREATE INDEX IF NOT EXISTS idx_user_trials_expires ON user_trials(expires_at);

-- ============================================
-- 4. PORTFOLIO SYSTEM
-- ============================================

-- Open positions
CREATE TABLE IF NOT EXISTS portfolio_positions (
    id SERIAL PRIMARY KEY,
    workspace_id VARCHAR(100) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    side VARCHAR(10) NOT NULL CHECK (side IN ('LONG', 'SHORT')),
    quantity DECIMAL(18, 8) NOT NULL,
    entry_price DECIMAL(18, 8) NOT NULL,
    current_price DECIMAL(18, 8) NOT NULL,
    entry_date TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_positions_workspace ON portfolio_positions(workspace_id);

-- Closed positions
CREATE TABLE IF NOT EXISTS portfolio_closed (
    id SERIAL PRIMARY KEY,
    workspace_id VARCHAR(100) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    side VARCHAR(10) NOT NULL CHECK (side IN ('LONG', 'SHORT')),
    quantity DECIMAL(18, 8) NOT NULL,
    entry_price DECIMAL(18, 8) NOT NULL,
    close_price DECIMAL(18, 8) NOT NULL,
    entry_date TIMESTAMP NOT NULL,
    close_date TIMESTAMP NOT NULL,
    realized_pl DECIMAL(18, 8) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_closed_workspace ON portfolio_closed(workspace_id);

-- Performance snapshots
CREATE TABLE IF NOT EXISTS portfolio_performance (
    id SERIAL PRIMARY KEY,
    workspace_id VARCHAR(100) NOT NULL,
    snapshot_date DATE NOT NULL,
    total_value DECIMAL(18, 8) NOT NULL,
    total_pl DECIMAL(18, 8) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(workspace_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_portfolio_performance_workspace ON portfolio_performance(workspace_id, snapshot_date);

-- ============================================
-- 5. TRADE JOURNAL
-- ============================================
CREATE TABLE IF NOT EXISTS journal_entries (
    id SERIAL PRIMARY KEY,
    workspace_id VARCHAR(100) NOT NULL,
    trade_date DATE NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    side VARCHAR(10) NOT NULL CHECK (side IN ('LONG', 'SHORT')),
    trade_type VARCHAR(20) NOT NULL CHECK (trade_type IN ('Spot', 'Options', 'Futures', 'Margin')),
    option_type VARCHAR(10),
    strike_price DECIMAL(18, 8),
    expiration_date DATE,
    quantity DECIMAL(18, 8) NOT NULL,
    entry_price DECIMAL(18, 8) NOT NULL,
    exit_price DECIMAL(18, 8),
    exit_date DATE,
    pl DECIMAL(18, 8),
    pl_percent DECIMAL(10, 4),
    strategy VARCHAR(100),
    setup VARCHAR(100),
    notes TEXT,
    emotions TEXT,
    outcome VARCHAR(20) CHECK (outcome IN ('win', 'loss', 'breakeven', 'open')),
    tags TEXT[],
    is_open BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_workspace ON journal_entries(workspace_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(workspace_id, trade_date DESC);

-- ============================================
-- 6. DELETE REQUESTS (GDPR)
-- ============================================
CREATE TABLE IF NOT EXISTS delete_requests (
    id SERIAL PRIMARY KEY,
    workspace_id VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    reason TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP,
    admin_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_delete_requests_status ON delete_requests(status, created_at);
CREATE INDEX IF NOT EXISTS idx_delete_requests_workspace ON delete_requests(workspace_id);

-- ============================================
-- 7. DAILY PICKS (Scanner Cache)
-- ============================================
CREATE TABLE IF NOT EXISTS daily_picks (
    id SERIAL PRIMARY KEY,
    asset_class VARCHAR(20) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    score INTEGER NOT NULL,
    direction VARCHAR(10) NOT NULL,
    signals_bullish INTEGER DEFAULT 0,
    signals_bearish INTEGER DEFAULT 0,
    signals_neutral INTEGER DEFAULT 0,
    price DECIMAL(20, 8),
    change_percent DECIMAL(10, 4),
    indicators JSONB,
    signals JSONB,
    rank_type VARCHAR(10) DEFAULT 'top',
    scan_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(asset_class, symbol, scan_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_picks_date ON daily_picks(scan_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_picks_class_date ON daily_picks(asset_class, scan_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_picks_score ON daily_picks(scan_date, asset_class, score DESC);
CREATE INDEX IF NOT EXISTS idx_daily_picks_rank ON daily_picks(scan_date, asset_class, rank_type, score DESC);

-- ============================================
-- 8. ALERTS SYSTEM
-- ============================================
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    asset_type VARCHAR(20) NOT NULL DEFAULT 'crypto',
    condition_type VARCHAR(50) NOT NULL,
    condition_value DECIMAL(20, 8) NOT NULL,
    condition_timeframe VARCHAR(10),
    name VARCHAR(100),
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_recurring BOOLEAN NOT NULL DEFAULT false,
    notify_email BOOLEAN NOT NULL DEFAULT true,
    notify_push BOOLEAN NOT NULL DEFAULT true,
    triggered_at TIMESTAMPTZ,
    trigger_count INT NOT NULL DEFAULT 0,
    last_checked_at TIMESTAMPTZ,
    last_price DECIMAL(20, 8),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    -- Smart alerts columns
    is_smart_alert BOOLEAN DEFAULT false,
    smart_alert_context JSONB,
    last_derivative_value DECIMAL(20, 8),
    cooldown_minutes INT DEFAULT 60,
    -- Multi-condition columns
    is_multi_condition BOOLEAN DEFAULT false,
    condition_logic VARCHAR(10) DEFAULT 'AND',
    parent_alert_id UUID REFERENCES alerts(id) ON DELETE CASCADE,
    CONSTRAINT valid_asset_type CHECK (asset_type IN ('crypto', 'equity', 'forex', 'commodity'))
);

CREATE INDEX IF NOT EXISTS idx_alerts_workspace ON alerts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts(workspace_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_alerts_symbol ON alerts(symbol, is_active) WHERE is_active = true;

-- Alert quotas
CREATE TABLE IF NOT EXISTS alert_quotas (
    workspace_id UUID PRIMARY KEY,
    tier VARCHAR(20) NOT NULL DEFAULT 'free',
    max_alerts INT NOT NULL DEFAULT 3,
    active_alerts INT NOT NULL DEFAULT 0,
    total_triggers_today INT NOT NULL DEFAULT 0,
    last_trigger_reset TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Alert history
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

-- Alert conditions (multi-condition)
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

-- Smart alert snapshots
CREATE TABLE IF NOT EXISTS smart_alert_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    total_oi_btc DECIMAL(20, 2),
    total_oi_usd DECIMAL(20, 2),
    oi_change_24h DECIMAL(10, 4),
    btc_oi DECIMAL(20, 2),
    btc_oi_change DECIMAL(10, 4),
    btc_funding_rate DECIMAL(10, 6),
    btc_ls_ratio DECIMAL(10, 4),
    eth_oi DECIMAL(20, 2),
    eth_oi_change DECIMAL(10, 4),
    eth_funding_rate DECIMAL(10, 6),
    eth_ls_ratio DECIMAL(10, 4),
    fear_greed_value INT,
    fear_greed_class VARCHAR(20),
    avg_funding_rate DECIMAL(10, 6),
    avg_ls_ratio DECIMAL(10, 4),
    raw_data JSONB
);

CREATE INDEX IF NOT EXISTS idx_smart_snapshots_time ON smart_alert_snapshots(captured_at DESC);

-- ============================================
-- 9. WATCHLISTS
-- ============================================
CREATE TABLE IF NOT EXISTS watchlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    name VARCHAR(50) NOT NULL,
    description VARCHAR(200),
    color VARCHAR(20) DEFAULT 'emerald',
    icon VARCHAR(20) DEFAULT 'star',
    is_default BOOLEAN NOT NULL DEFAULT false,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_watchlists_workspace ON watchlists(workspace_id);
CREATE INDEX IF NOT EXISTS idx_watchlists_default ON watchlists(workspace_id, is_default) WHERE is_default = true;

CREATE TABLE IF NOT EXISTS watchlist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    watchlist_id UUID NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    asset_type VARCHAR(20) NOT NULL DEFAULT 'equity',
    notes VARCHAR(200),
    added_price DECIMAL(20, 8),
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(watchlist_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_items_watchlist ON watchlist_items(watchlist_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_items_workspace ON watchlist_items(workspace_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_items_symbol ON watchlist_items(symbol);

-- ============================================
-- 10. AI USAGE TRACKING
-- ============================================
CREATE TABLE IF NOT EXISTS ai_usage (
    id SERIAL PRIMARY KEY,
    workspace_id VARCHAR(100) NOT NULL,
    question TEXT NOT NULL,
    response_length INTEGER NOT NULL,
    tier VARCHAR(50) NOT NULL,
    prompt_tokens INT DEFAULT 0,
    completion_tokens INT DEFAULT 0,
    total_tokens INT DEFAULT 0,
    model VARCHAR(50) DEFAULT 'gpt-4o-mini',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_workspace_date ON ai_usage(workspace_id, DATE(created_at));
CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage(created_at DESC);

-- ============================================
-- 11. PUSH SUBSCRIPTIONS
-- ============================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh_key TEXT NOT NULL,
    auth_key TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workspace_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_workspace ON push_subscriptions(workspace_id);

-- ============================================
-- 12. HELPER FUNCTIONS & TRIGGERS
-- ============================================

-- Auto-update updated_at function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with updated_at
DROP TRIGGER IF EXISTS alerts_updated_at ON alerts;
CREATE TRIGGER alerts_updated_at
    BEFORE UPDATE ON alerts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS watchlists_updated_at ON watchlists;
CREATE TRIGGER watchlists_updated_at
    BEFORE UPDATE ON watchlists
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 13. HELPFUL VIEWS
-- ============================================

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

-- ============================================
-- DONE! Database schema is ready.
-- ============================================
SELECT 'Database schema created successfully!' as status;
