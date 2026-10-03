-- Widen only. Existing stock/crypto keys and saved data remain intact.
ALTER TABLE watchlist_items ALTER COLUMN symbol TYPE VARCHAR(96);
