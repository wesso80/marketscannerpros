-- Apply after 103 and before deploying the ownership repair. No historical attribution/backfill.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='ai_signal_log' AND column_name='price_after_24h_at')
 OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='ai_signal_log' AND column_name='outcome_4h')
 THEN RAISE EXCEPTION 'Apply migration 103 before outcome ownership migration 133'; END IF;
END $$;
ALTER TABLE ai_signal_log
 ADD COLUMN IF NOT EXISTS outcome_provenance JSONB,
 ADD COLUMN IF NOT EXISTS outcome_4h_provenance JSONB,
 ADD COLUMN IF NOT EXISTS lifecycle_outcome VARCHAR(20),
 ADD COLUMN IF NOT EXISTS lifecycle_outcome_measured_at TIMESTAMPTZ,
 ADD COLUMN IF NOT EXISTS lifecycle_method TEXT,
 ADD COLUMN IF NOT EXISTS lifecycle_provenance JSONB;
COMMENT ON COLUMN ai_signal_log.outcome_provenance IS 'NULL means unknown historical provenance; new 24h measurement or expiry provenance is atomic with outcome.';
COMMENT ON COLUMN ai_signal_log.outcome_4h_provenance IS 'NULL means unknown historical provenance; new 4h evidence is written atomically.';
COMMENT ON COLUMN ai_signal_log.lifecycle_outcome IS 'Lifecycle target/stop/expiry classification; never a fixed-horizon verdict.';

-- Old deployed writers must not be able to relabel evidence created by the new writer.
CREATE OR REPLACE FUNCTION protect_ai_horizon_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.outcome_provenance IS NOT NULL AND
   ROW(NEW.trade_bias,NEW.price_at_signal,NEW.signal_at,NEW.outcome,NEW.price_after_24h,NEW.pct_move_24h,NEW.price_after_24h_at,NEW.outcome_measured_at,NEW.outcome_provenance)
   IS DISTINCT FROM ROW(OLD.trade_bias,OLD.price_at_signal,OLD.signal_at,OLD.outcome,OLD.price_after_24h,OLD.pct_move_24h,OLD.price_after_24h_at,OLD.outcome_measured_at,OLD.outcome_provenance)
 THEN RAISE EXCEPTION 'Verified 24h outcome evidence is immutable'; END IF;
 IF OLD.outcome_4h_provenance IS NOT NULL AND
   ROW(NEW.trade_bias,NEW.price_at_signal,NEW.signal_at,NEW.outcome_4h,NEW.price_after_4h,NEW.pct_move_4h,NEW.price_after_4h_at,NEW.outcome_4h_measured_at,NEW.outcome_4h_provenance)
   IS DISTINCT FROM ROW(OLD.trade_bias,OLD.price_at_signal,OLD.signal_at,OLD.outcome_4h,OLD.price_after_4h,OLD.pct_move_4h,OLD.price_after_4h_at,OLD.outcome_4h_measured_at,OLD.outcome_4h_provenance)
 THEN RAISE EXCEPTION 'Verified 4h outcome evidence is immutable'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ai_horizon_evidence_immutable ON ai_signal_log;
CREATE TRIGGER ai_horizon_evidence_immutable BEFORE UPDATE ON ai_signal_log
 FOR EACH ROW EXECUTE FUNCTION protect_ai_horizon_evidence();
COMMIT;
