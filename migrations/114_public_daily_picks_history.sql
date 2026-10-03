-- Review and run explicitly before deploying ?date= history queries. No source rows are deleted or updated.
BEGIN;
CREATE TABLE IF NOT EXISTS daily_picks_history (
  id BIGSERIAL PRIMARY KEY,
  published_at TIMESTAMPTZ NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_as_of TIMESTAMPTZ,
  run_id TEXT NOT NULL,
  scan_date DATE NOT NULL,
  asset_class TEXT NOT NULL,
  symbol TEXT NOT NULL,
  pick JSONB NOT NULL,
  UNIQUE(asset_class, symbol, scan_date)
);
CREATE INDEX IF NOT EXISTS daily_picks_history_date_idx ON daily_picks_history(scan_date, asset_class);
CREATE OR REPLACE FUNCTION archive_daily_pick() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO daily_picks_history(published_at,data_as_of,run_id,scan_date,asset_class,symbol,pick)
  VALUES(NEW.created_at AT TIME ZONE 'UTC', NULLIF(NEW.indicators->>'data_as_of','')::timestamptz,
    COALESCE(NEW.indicators->>'run_id','legacy-' || NEW.id::text),NEW.scan_date,NEW.asset_class,NEW.symbol,to_jsonb(NEW))
  ON CONFLICT(asset_class,symbol,scan_date) DO NOTHING;
  RETURN NEW;
END $$;
-- daily_picks.created_at is the existing UTC timestamp-without-time-zone column.
-- Interpret it explicitly; the migration session timezone must not shift the publication.
-- Capture any writer's FIRST publication. Repeated inserts are idempotent on daily_picks' own unique constraint.
CREATE TRIGGER archive_daily_pick_insert AFTER INSERT ON daily_picks FOR EACH ROW EXECUTE FUNCTION archive_daily_pick();
INSERT INTO daily_picks_history(published_at,data_as_of,run_id,scan_date,asset_class,symbol,pick)
SELECT created_at AT TIME ZONE 'UTC', NULLIF(indicators->>'data_as_of','')::timestamptz,
 COALESCE(indicators->>'run_id','legacy-' || id::text),scan_date,asset_class,symbol,to_jsonb(dp)
FROM daily_picks dp ON CONFLICT(asset_class,symbol,scan_date) DO NOTHING;
CREATE OR REPLACE FUNCTION protect_daily_pick_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'daily_picks_history is append-only'; END $$;
CREATE TRIGGER protect_daily_pick_history_rows BEFORE UPDATE OR DELETE ON daily_picks_history
 FOR EACH ROW EXECUTE FUNCTION protect_daily_pick_history();
CREATE TRIGGER protect_daily_pick_history_truncate BEFORE TRUNCATE ON daily_picks_history
 FOR EACH STATEMENT EXECUTE FUNCTION protect_daily_pick_history();
COMMIT;
