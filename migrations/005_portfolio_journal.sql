-- Portfolio and Journal tables for cross-device sync
-- Run this migration on your PostgreSQL database

-- Portfolio positions (open positions)
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

CREATE INDEX IF NOT EXISTS idx_portfolio_positions_workspace 
ON portfolio_positions (workspace_id);

-- Closed portfolio positions (history)
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

CREATE INDEX IF NOT EXISTS idx_portfolio_closed_workspace 
ON portfolio_closed (workspace_id);

-- Portfolio performance snapshots (daily)
CREATE TABLE IF NOT EXISTS portfolio_performance (
    id SERIAL PRIMARY KEY,
    workspace_id VARCHAR(100) NOT NULL,
    snapshot_date DATE NOT NULL,
    total_value DECIMAL(18, 8) NOT NULL,
    total_pl DECIMAL(18, 8) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(workspace_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_portfolio_performance_workspace 
ON portfolio_performance (workspace_id, snapshot_date);

-- Trade journal entries
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
    normalized_r DECIMAL(12, 6),
    dynamic_r DECIMAL(12, 6),
    risk_per_trade_at_entry DECIMAL(10, 6),
    equity_at_entry DECIMAL(20, 8),
    tags TEXT[], -- Array of tags
    is_open BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_workspace 
ON journal_entries (workspace_id);

CREATE INDEX IF NOT EXISTS idx_journal_entries_date 
ON journal_entries (workspace_id, trade_date DESC);
