-- PROPOSAL ONLY. Do not apply this from a migration runner. Not executed.
-- Reviewed for the 9 Oct 2026 accuracy check. It does not delete rows.
--
-- signal_outcomes.outcome is constrained to correct, wrong, neutral, unknown
-- (migrations/003_signals_learning.sql). These rows are marked unknown.
-- pct_move and price_later stay on the row.
--
-- signals_fired has no asset_class column. features_json->>'asset_class' matched
-- 0 rows, so this file does not use it. Part C joins symbol_universe.asset_type
-- and a fixed coin-ticker list (the app coin map is not a table).
--
-- Real columns used:
--   signal_outcomes.id, outcome, labeled_at, pct_move, price_later, signal_id
--   signals_fired.id, symbol
--   symbol_universe.symbol, asset_type
--
-- Each part is its own transaction and can run alone. Part A is the over-50% cleanup.
-- The labelled-after-window rule is not in this file.
-- The undo block at the bottom is commented so running this file does not restore
-- the rows it just changed. Uncomment that block and run it alone to undo.

-- Step 0. Backup table. Safe to re-run. Parts A and C also create it so each can run alone.
BEGIN;
CREATE TABLE IF NOT EXISTS signal_outcomes_backup_20261009 (
  id BIGINT PRIMARY KEY,
  outcome VARCHAR(20) NOT NULL,
  labeled_at TIMESTAMPTZ,
  pct_move NUMERIC(10,4),
  price_later NUMERIC(18,8),
  reason TEXT NOT NULL,
  backed_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMIT;

-- Part A. Moves over 50% (counted at 283 rows). Runnable on its own.
BEGIN;
CREATE TABLE IF NOT EXISTS signal_outcomes_backup_20261009 (
  id BIGINT PRIMARY KEY,
  outcome VARCHAR(20) NOT NULL,
  labeled_at TIMESTAMPTZ,
  pct_move NUMERIC(10,4),
  price_later NUMERIC(18,8),
  reason TEXT NOT NULL,
  backed_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT COUNT(*) AS part_a_over_50
  FROM signal_outcomes so
 WHERE so.outcome IN ('correct', 'wrong', 'neutral')
   AND ABS(so.pct_move) > 50;

INSERT INTO signal_outcomes_backup_20261009 (id, outcome, labeled_at, pct_move, price_later, reason)
SELECT so.id, so.outcome, so.labeled_at, so.pct_move, so.price_later, 'over_50'
  FROM signal_outcomes so
 WHERE so.outcome IN ('correct', 'wrong', 'neutral')
   AND ABS(so.pct_move) > 50
ON CONFLICT (id) DO NOTHING;

UPDATE signal_outcomes so
   SET outcome = 'unknown',
       labeled_at = NOW()
 WHERE so.outcome IN ('correct', 'wrong', 'neutral')
   AND ABS(so.pct_move) > 50;

SELECT refresh_signal_accuracy(90);
COMMIT;

-- Part C. Asset mismatch on stored columns (not features_json).
-- A symbol that has both a crypto and an equity/etf/stock row in symbol_universe,
-- a coin-map collision ticker that also has an equity row, or a renamed ticker
-- (FTM → S/sonic, MATIC → POL) whose stored coin id is the retired asset.
BEGIN;
CREATE TABLE IF NOT EXISTS signal_outcomes_backup_20261009 (
  id BIGINT PRIMARY KEY,
  outcome VARCHAR(20) NOT NULL,
  labeled_at TIMESTAMPTZ,
  pct_move NUMERIC(10,4),
  price_later NUMERIC(18,8),
  reason TEXT NOT NULL,
  backed_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT COUNT(*) AS part_c_asset_mismatch
  FROM signal_outcomes so
  JOIN signals_fired sf ON sf.id = so.signal_id
 WHERE so.outcome IN ('correct', 'wrong', 'neutral')
   AND (
        (
          EXISTS (
            SELECT 1 FROM symbol_universe c
             WHERE upper(c.symbol) = upper(sf.symbol)
               AND lower(c.asset_type) IN ('crypto', 'cryptocurrency')
          )
          AND EXISTS (
            SELECT 1 FROM symbol_universe e
             WHERE upper(e.symbol) = upper(sf.symbol)
               AND lower(e.asset_type) IN ('equity', 'equities', 'stock', 'etf')
          )
        )
        OR (
          upper(sf.symbol) IN ('YFI', 'MI', 'FTM', 'JUP', 'ENJ', 'BEAM', 'MATIC')
          AND EXISTS (
            SELECT 1 FROM symbol_universe e
             WHERE upper(e.symbol) = upper(sf.symbol)
               AND lower(e.asset_type) IN ('equity', 'equities', 'stock', 'etf')
          )
        )
        OR upper(sf.symbol) IN ('FTM', 'FTMUSDT', 'MATIC', 'MATICUSDT')
   );

INSERT INTO signal_outcomes_backup_20261009 (id, outcome, labeled_at, pct_move, price_later, reason)
SELECT so.id, so.outcome, so.labeled_at, so.pct_move, so.price_later, 'asset_mismatch'
  FROM signal_outcomes so
  JOIN signals_fired sf ON sf.id = so.signal_id
 WHERE so.outcome IN ('correct', 'wrong', 'neutral')
   AND (
        (
          EXISTS (
            SELECT 1 FROM symbol_universe c
             WHERE upper(c.symbol) = upper(sf.symbol)
               AND lower(c.asset_type) IN ('crypto', 'cryptocurrency')
          )
          AND EXISTS (
            SELECT 1 FROM symbol_universe e
             WHERE upper(e.symbol) = upper(sf.symbol)
               AND lower(e.asset_type) IN ('equity', 'equities', 'stock', 'etf')
          )
        )
        OR (
          upper(sf.symbol) IN ('YFI', 'MI', 'FTM', 'JUP', 'ENJ', 'BEAM', 'MATIC')
          AND EXISTS (
            SELECT 1 FROM symbol_universe e
             WHERE upper(e.symbol) = upper(sf.symbol)
               AND lower(e.asset_type) IN ('equity', 'equities', 'stock', 'etf')
          )
        )
        OR upper(sf.symbol) IN ('FTM', 'FTMUSDT', 'MATIC', 'MATICUSDT')
   )
ON CONFLICT (id) DO NOTHING;

UPDATE signal_outcomes so
   SET outcome = 'unknown',
       labeled_at = NOW()
  FROM signals_fired sf
 WHERE so.signal_id = sf.id
   AND so.outcome IN ('correct', 'wrong', 'neutral')
   AND (
        (
          EXISTS (
            SELECT 1 FROM symbol_universe c
             WHERE upper(c.symbol) = upper(sf.symbol)
               AND lower(c.asset_type) IN ('crypto', 'cryptocurrency')
          )
          AND EXISTS (
            SELECT 1 FROM symbol_universe e
             WHERE upper(e.symbol) = upper(sf.symbol)
               AND lower(e.asset_type) IN ('equity', 'equities', 'stock', 'etf')
          )
        )
        OR (
          upper(sf.symbol) IN ('YFI', 'MI', 'FTM', 'JUP', 'ENJ', 'BEAM', 'MATIC')
          AND EXISTS (
            SELECT 1 FROM symbol_universe e
             WHERE upper(e.symbol) = upper(sf.symbol)
               AND lower(e.asset_type) IN ('equity', 'equities', 'stock', 'etf')
          )
        )
        OR upper(sf.symbol) IN ('FTM', 'FTMUSDT', 'MATIC', 'MATICUSDT')
   );

SELECT refresh_signal_accuracy(90);
COMMIT;

-- Undo. Do not run this with the cleanup above. Run this block alone to restore
-- outcome, labeled_at, pct_move, and price_later from the backup.
-- Only rows that are still unknown are restored, then accuracy stats are rebuilt.
-- BEGIN;
-- UPDATE signal_outcomes so
--    SET outcome = b.outcome,
--        labeled_at = b.labeled_at,
--        pct_move = b.pct_move,
--        price_later = b.price_later
--   FROM signal_outcomes_backup_20261009 b
--  WHERE so.id = b.id
--    AND so.outcome = 'unknown';
-- SELECT refresh_signal_accuracy(90);
-- COMMIT;
