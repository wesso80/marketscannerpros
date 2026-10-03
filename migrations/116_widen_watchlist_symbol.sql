-- watchlist_items.symbol is VARCHAR(20) in migrations/011_watchlists.sql. Widen only.
BEGIN;
ALTER TABLE watchlist_items ALTER COLUMN symbol TYPE VARCHAR(96);
COMMIT;
