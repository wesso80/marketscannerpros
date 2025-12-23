-- Watchlists System Schema
-- Run this migration in Neon PostgreSQL console

-- Watchlists table - user's custom watchlists
CREATE TABLE IF NOT EXISTS watchlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    name VARCHAR(50) NOT NULL,
    description VARCHAR(200),
    color VARCHAR(20) DEFAULT 'emerald', -- emerald, blue, purple, amber, rose
    icon VARCHAR(20) DEFAULT 'star', -- star, chart, fire, rocket, eye
    is_default BOOLEAN NOT NULL DEFAULT false,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Watchlist items - symbols in each watchlist
CREATE TABLE IF NOT EXISTS watchlist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    watchlist_id UUID NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    asset_type VARCHAR(20) NOT NULL DEFAULT 'equity', -- equity, crypto, forex, commodity
    notes VARCHAR(200),
    added_price DECIMAL(20, 8), -- Price when added (for tracking)
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Prevent duplicate symbols in same watchlist
    UNIQUE(watchlist_id, symbol)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_watchlists_workspace ON watchlists(workspace_id);
CREATE INDEX IF NOT EXISTS idx_watchlists_default ON watchlists(workspace_id, is_default) WHERE is_default = true;
CREATE INDEX IF NOT EXISTS idx_watchlist_items_watchlist ON watchlist_items(watchlist_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_items_workspace ON watchlist_items(workspace_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_items_symbol ON watchlist_items(symbol);

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_watchlists_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS watchlists_updated_at ON watchlists;
CREATE TRIGGER watchlists_updated_at
    BEFORE UPDATE ON watchlists
    FOR EACH ROW
    EXECUTE FUNCTION update_watchlists_updated_at();

-- Comments
COMMENT ON TABLE watchlists IS 'User-created watchlists for organizing tracked symbols';
COMMENT ON TABLE watchlist_items IS 'Symbols belonging to each watchlist';
COMMENT ON COLUMN watchlist_items.added_price IS 'Price when symbol was added, for performance tracking';
