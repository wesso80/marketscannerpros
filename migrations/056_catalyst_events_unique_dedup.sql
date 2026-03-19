-- ============================================================
-- Migration 056: Add unique constraint for catalyst_events dedup
-- Enables ON CONFLICT (ticker, source, event_timestamp_utc) DO NOTHING
-- for batch upserts instead of SELECT-then-INSERT per row.
-- ============================================================

-- 1. Remove duplicate rows, keeping one per group (by ctid)
DELETE FROM catalyst_events a
USING catalyst_events b
WHERE a.ticker = b.ticker
  AND a.source = b.source
  AND a.event_timestamp_utc = b.event_timestamp_utc
  AND a.ctid > b.ctid;

-- 2. Drop the old non-unique index
DROP INDEX IF EXISTS idx_catalyst_events_dedup;

-- 3. Create a unique index on the same columns
CREATE UNIQUE INDEX idx_catalyst_events_dedup
  ON catalyst_events (ticker, source, event_timestamp_utc);
