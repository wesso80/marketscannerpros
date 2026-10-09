-- PROPOSAL ONLY. Do not apply this from a migration runner.
-- Reviewed for the 9 Oct 2026 accuracy check. It does not delete rows.
--
-- signal_outcomes.outcome is constrained to correct, wrong, neutral, unknown
-- (migrations/003_signals_learning.sql). expired and suspect are not stored
-- values, so these rows are marked unknown. The percent stays on the row so
-- the bad print is still visible as unknown rather than as correct or wrong.
--
-- A label written after the horizon is normal (the job runs once the window
-- has closed). "Used a later price" is approximated by: the stored price_later
-- still equals quotes_latest.price, the signal is more than 7 days old, and
-- the row was labelled after the horizon window. Read the preview before running
-- the update. Names that truly did not move can appear in that third group.

-- Preview
SELECT so.id,
       sf.symbol,
       sf.signal_at,
       so.horizon_minutes,
       so.pct_move,
       so.price_later,
       so.outcome,
       so.labeled_at,
       sf.features_json->>'asset_class' AS declared_class
  FROM signal_outcomes so
  JOIN signals_fired sf ON sf.id = so.signal_id
  LEFT JOIN quotes_latest ql ON ql.symbol = sf.symbol
 WHERE so.outcome IN ('correct', 'wrong', 'neutral')
   AND (
        ABS(so.pct_move) > 50
     OR (
          lower(COALESCE(sf.features_json->>'asset_class', '')) IN ('equity', 'stock', 'etf')
          AND (
            upper(sf.symbol) IN ('YFI', 'MI', 'FTM', 'JUP', 'ENJ', 'BEAM')
            OR EXISTS (
              SELECT 1 FROM symbol_universe u
               WHERE u.symbol = sf.symbol AND lower(u.asset_type) = 'crypto'
            )
          )
        )
     OR (
          lower(COALESCE(sf.features_json->>'asset_class', '')) IN ('crypto', 'cryptocurrency')
          AND EXISTS (
            SELECT 1 FROM symbol_universe u
             WHERE u.symbol = sf.symbol AND lower(u.asset_type) IN ('equity', 'etf')
          )
        )
     OR (
          EXISTS (
            SELECT 1 FROM symbol_universe c
             WHERE c.symbol = sf.symbol AND lower(c.asset_type) = 'crypto'
          )
          AND EXISTS (
            SELECT 1 FROM symbol_universe e
             WHERE e.symbol = sf.symbol AND lower(e.asset_type) IN ('equity', 'etf')
          )
        )
     OR (
          sf.signal_at < NOW() - INTERVAL '7 days'
          AND so.price_later IS NOT NULL
          AND ql.price IS NOT NULL
          AND so.price_later = ql.price
          AND so.labeled_at > sf.signal_at
              + (so.horizon_minutes || ' minutes')::interval
              + CASE so.horizon_minutes
                  WHEN 60 THEN INTERVAL '120 minutes'
                  WHEN 240 THEN INTERVAL '240 minutes'
                  WHEN 1440 THEN INTERVAL '1440 minutes'
                  WHEN 10080 THEN INTERVAL '2880 minutes'
                  ELSE INTERVAL '240 minutes'
                END
        )
   )
 ORDER BY ABS(so.pct_move) DESC NULLS LAST;

-- Update (same predicate). Run only after the preview looks right.
UPDATE signal_outcomes so
   SET outcome = 'unknown',
       labeled_at = NOW()
  FROM signals_fired sf
  LEFT JOIN quotes_latest ql ON ql.symbol = sf.symbol
 WHERE so.signal_id = sf.id
   AND so.outcome IN ('correct', 'wrong', 'neutral')
   AND (
        ABS(so.pct_move) > 50
     OR (
          lower(COALESCE(sf.features_json->>'asset_class', '')) IN ('equity', 'stock', 'etf')
          AND (
            upper(sf.symbol) IN ('YFI', 'MI', 'FTM', 'JUP', 'ENJ', 'BEAM')
            OR EXISTS (
              SELECT 1 FROM symbol_universe u
               WHERE u.symbol = sf.symbol AND lower(u.asset_type) = 'crypto'
            )
          )
        )
     OR (
          lower(COALESCE(sf.features_json->>'asset_class', '')) IN ('crypto', 'cryptocurrency')
          AND EXISTS (
            SELECT 1 FROM symbol_universe u
             WHERE u.symbol = sf.symbol AND lower(u.asset_type) IN ('equity', 'etf')
          )
        )
     OR (
          EXISTS (
            SELECT 1 FROM symbol_universe c
             WHERE c.symbol = sf.symbol AND lower(c.asset_type) = 'crypto'
          )
          AND EXISTS (
            SELECT 1 FROM symbol_universe e
             WHERE e.symbol = sf.symbol AND lower(e.asset_type) IN ('equity', 'etf')
          )
        )
     OR (
          sf.signal_at < NOW() - INTERVAL '7 days'
          AND so.price_later IS NOT NULL
          AND ql.price IS NOT NULL
          AND so.price_later = ql.price
          AND so.labeled_at > sf.signal_at
              + (so.horizon_minutes || ' minutes')::interval
              + CASE so.horizon_minutes
                  WHEN 60 THEN INTERVAL '120 minutes'
                  WHEN 240 THEN INTERVAL '240 minutes'
                  WHEN 1440 THEN INTERVAL '1440 minutes'
                  WHEN 10080 THEN INTERVAL '2880 minutes'
                  ELSE INTERVAL '240 minutes'
                END
        )
   );
