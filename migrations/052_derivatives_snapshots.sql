-- 052: Per-coin derivatives snapshots for historical funding rate / OI charting
-- Extends the existing smart_alert_snapshots (which only stores BTC + ETH aggregate)
-- This stores per-coin per-snapshot data for top 20 coins

CREATE TABLE IF NOT EXISTS derivatives_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    symbol VARCHAR(20) NOT NULL,
    funding_rate_pct DECIMAL(12, 6),
    annualised_pct DECIMAL(12, 2),
    sentiment VARCHAR(10),
    total_oi DECIMAL(20, 2),
    total_volume_24h DECIMAL(20, 2),
    exchange_count INT,
    price DECIMAL(20, 8),
    change_24h DECIMAL(10, 4)
);

CREATE INDEX IF NOT EXISTS idx_deriv_snap_symbol_time ON derivatives_snapshots(symbol, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_deriv_snap_time ON derivatives_snapshots(captured_at DESC);

-- Stablecoin supply snapshots for liquidity proxy tracking
CREATE TABLE IF NOT EXISTS stablecoin_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    usdt_market_cap DECIMAL(20, 2),
    usdc_market_cap DECIMAL(20, 2),
    total_stablecoin_cap DECIMAL(20, 2),
    usdt_24h_change DECIMAL(10, 4),
    usdc_24h_change DECIMAL(10, 4)
);

CREATE INDEX IF NOT EXISTS idx_stable_snap_time ON stablecoin_snapshots(captured_at DESC);

-- Retention policy: keep 90 days of snapshots
-- DELETE FROM derivatives_snapshots WHERE captured_at < NOW() - INTERVAL '90 days';
-- DELETE FROM stablecoin_snapshots WHERE captured_at < NOW() - INTERVAL '90 days';
