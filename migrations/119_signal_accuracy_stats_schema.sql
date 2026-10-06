-- signal_accuracy_stats: bring the live table up to the migration 003 shape,
-- then keep refresh_signal_accuracy as the only stats writer for 1d and 1w.
--
-- MUST be run once by hand in Neon. This file is NOT run by the app.
-- Safe to run twice. Columns use ADD COLUMN IF NOT EXISTS, the primary key
-- change is skipped once it already has 4 columns, and the function is
-- CREATE OR REPLACE.

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.signal_accuracy_stats
  ADD COLUMN IF NOT EXISTS scanner_version VARCHAR(20) DEFAULT 'unknown';

ALTER TABLE public.signal_accuracy_stats
  ADD COLUMN IF NOT EXISTS labeled_signals INT DEFAULT 0;

ALTER TABLE public.signal_accuracy_stats
  ADD COLUMN IF NOT EXISTS unknown_count INT DEFAULT 0;

ALTER TABLE public.signal_accuracy_stats
  ADD COLUMN IF NOT EXISTS median_pct_move NUMERIC(10,4);

-- The live table has 0 rows. Still backfill before NOT NULL so a later row
-- with a null scanner_version cannot block the constraint.
UPDATE public.signal_accuracy_stats
SET scanner_version = 'unknown'
WHERE scanner_version IS NULL;

ALTER TABLE public.signal_accuracy_stats
  ALTER COLUMN scanner_version SET DEFAULT 'unknown';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_attribute a
    JOIN pg_class t ON t.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'signal_accuracy_stats'
      AND a.attname = 'scanner_version'
      AND a.attnotnull = false
      AND a.attisdropped = false
  ) THEN
    ALTER TABLE public.signal_accuracy_stats
      ALTER COLUMN scanner_version SET NOT NULL;
  END IF;
END $$;

-- Drop signal_accuracy_stats_pkey only when it is not already the 4-column key,
-- then add (signal_type, direction, horizon_minutes, scanner_version).
DO $$
DECLARE
  pk_cols integer;
BEGIN
  SELECT COUNT(a.attnum)
    INTO pk_cols
  FROM pg_constraint c
  JOIN pg_attribute a
    ON a.attrelid = c.conrelid
   AND a.attnum = ANY (c.conkey)
   AND a.attisdropped = false
  WHERE c.conrelid = 'public.signal_accuracy_stats'::regclass
    AND c.conname = 'signal_accuracy_stats_pkey'
    AND c.contype = 'p';

  IF pk_cols IS DISTINCT FROM 4 THEN
    IF pk_cols > 0 THEN
      ALTER TABLE public.signal_accuracy_stats DROP CONSTRAINT signal_accuracy_stats_pkey;
    END IF;

    ALTER TABLE public.signal_accuracy_stats
      ADD CONSTRAINT signal_accuracy_stats_pkey
      PRIMARY KEY (signal_type, direction, horizon_minutes, scanner_version);
  END IF;
END $$;

-- Same metric definitions as migrations/003_signals_learning.sql.
-- accuracy_pct = correct / (correct + wrong). precision_pct = correct / labelled.
-- Only 1440 (1d) and 10080 (1w) are written. Daily bars make shorter horizons unknown.
CREATE OR REPLACE FUNCTION refresh_signal_accuracy(p_days INT DEFAULT 90)
RETURNS VOID AS $$
BEGIN
  DELETE FROM signal_accuracy_stats;

  INSERT INTO signal_accuracy_stats (
    signal_type, direction, horizon_minutes, scanner_version,
    total_signals, labeled_signals, unknown_count,
    correct_count, wrong_count, neutral_count,
    accuracy_pct, precision_pct,
    avg_pct_when_correct, avg_pct_when_wrong, median_pct_move,
    accuracy_score_0_25, accuracy_score_26_50, accuracy_score_51_75, accuracy_score_76_100,
    window_start, window_end, computed_at
  )
  SELECT
    sf.signal_type,
    sf.direction,
    so.horizon_minutes,
    COALESCE(sf.scanner_version, 'unknown'), -- select item 4; GROUP BY 4 uses this expression
    COUNT(DISTINCT sf.id),
    -- Labeled = outcomes that are not 'unknown'
    COUNT(*) FILTER (WHERE so.outcome IN ('correct', 'wrong', 'neutral')),
    COUNT(*) FILTER (WHERE so.outcome = 'unknown'),
    COUNT(*) FILTER (WHERE so.outcome = 'correct'),
    COUNT(*) FILTER (WHERE so.outcome = 'wrong'),
    COUNT(*) FILTER (WHERE so.outcome = 'neutral'),
    -- Accuracy: correct / (correct + wrong), ignoring neutral and unknown
    ROUND(100.0 * COUNT(*) FILTER (WHERE so.outcome = 'correct') /
          NULLIF(COUNT(*) FILTER (WHERE so.outcome IN ('correct', 'wrong')), 0), 2),
    -- Precision: correct / labeled (excludes unknown)
    ROUND(100.0 * COUNT(*) FILTER (WHERE so.outcome = 'correct') /
          NULLIF(COUNT(*) FILTER (WHERE so.outcome IN ('correct', 'wrong', 'neutral')), 0), 2),
    -- Avg returns
    AVG(so.pct_move) FILTER (WHERE so.outcome = 'correct'),
    AVG(so.pct_move) FILTER (WHERE so.outcome = 'wrong'),
    -- Median of all known outcomes
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY so.pct_move) FILTER (WHERE so.outcome IN ('correct', 'wrong', 'neutral')),
    -- By score bucket
    ROUND(100.0 * COUNT(*) FILTER (WHERE so.outcome = 'correct' AND sf.score <= 25) /
          NULLIF(COUNT(*) FILTER (WHERE so.outcome IN ('correct','wrong') AND sf.score <= 25), 0), 2),
    ROUND(100.0 * COUNT(*) FILTER (WHERE so.outcome = 'correct' AND sf.score > 25 AND sf.score <= 50) /
          NULLIF(COUNT(*) FILTER (WHERE so.outcome IN ('correct','wrong') AND sf.score > 25 AND sf.score <= 50), 0), 2),
    ROUND(100.0 * COUNT(*) FILTER (WHERE so.outcome = 'correct' AND sf.score > 50 AND sf.score <= 75) /
          NULLIF(COUNT(*) FILTER (WHERE so.outcome IN ('correct','wrong') AND sf.score > 50 AND sf.score <= 75), 0), 2),
    ROUND(100.0 * COUNT(*) FILTER (WHERE so.outcome = 'correct' AND sf.score > 75) /
          NULLIF(COUNT(*) FILTER (WHERE so.outcome IN ('correct','wrong') AND sf.score > 75), 0), 2),
    -- Window
    MIN(sf.signal_at),
    MAX(sf.signal_at),
    NOW()
  FROM signals_fired sf
  JOIN signal_outcomes so ON sf.id = so.signal_id
  WHERE sf.signal_at > NOW() - (p_days || ' days')::INTERVAL
    AND so.horizon_minutes IN (1440, 10080)
  -- Group by the COALESCE expression (item 4), not the raw scanner_version.
  -- NULL and 'unknown' must land in one row or the primary key raises 23505.
  GROUP BY 1, 2, 3, 4;
END;
$$ LANGUAGE plpgsql;

COMMIT;
