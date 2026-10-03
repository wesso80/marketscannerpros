-- Explicitly review/run; no existing row, enabled flag, or paused job is changed.
-- Adds the missing public sector/credit instruments to the normal equity worker universe.
INSERT INTO symbol_universe (symbol, asset_type, name, tier, enabled) VALUES
 ('XLRE', 'equity', 'Real Estate Select Sector SPDR Fund', 3, TRUE),
 ('HYG', 'equity', 'iShares iBoxx High Yield Corporate Bond ETF', 3, TRUE),
 ('LQD', 'equity', 'iShares iBoxx Investment Grade Corporate Bond ETF', 3, TRUE)
ON CONFLICT (symbol) DO NOTHING;
