-- 6-week / 12-week outcome provenance and immutability for ai_signal_log.
-- Apply after 105 and 133, and before deploying the labeller that writes outcome_6w_provenance / outcome_12w_provenance.
-- Additive only: two nullable JSONB columns plus a wider immutability trigger. No backfill: existing 6w/12w results
-- keep NULL provenance (unknown historical provenance) and stay editable, exactly as before. Safe to run twice.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='ai_signal_log' AND column_name='outcome_12w_measured_at')
 OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='ai_signal_log' AND column_name='outcome_6w_measured_at')
 THEN RAISE EXCEPTION 'Apply migration 105 before long-horizon provenance migration 134'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='ai_signal_log' AND column_name='outcome_4h_provenance')
 THEN RAISE EXCEPTION 'Apply migration 133 before long-horizon provenance migration 134'; END IF;
END $$;
ALTER TABLE ai_signal_log
 ADD COLUMN IF NOT EXISTS outcome_6w_provenance JSONB,
 ADD COLUMN IF NOT EXISTS outcome_12w_provenance JSONB;
COMMENT ON COLUMN ai_signal_log.outcome_6w_provenance IS 'NULL means unknown historical provenance; new 6w evidence (measured or no_data) is written atomically with the outcome.';
COMMENT ON COLUMN ai_signal_log.outcome_12w_provenance IS 'NULL means unknown historical provenance; new 12w evidence (measured or no_data) is written atomically with the outcome.';

-- Same function as 133 (24h and 4h checks unchanged) plus 6w and 12w. The 6w/12w rows also cover stop_loss and
-- target_1, which feed first_hit and r_multiple.
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
 IF OLD.outcome_6w_provenance IS NOT NULL AND
   ROW(NEW.trade_bias,NEW.price_at_signal,NEW.signal_at,NEW.stop_loss,NEW.target_1,
       NEW.outcome_6w,NEW.price_after_6w,NEW.price_after_6w_at,NEW.pct_move_6w,NEW.max_price_6w,NEW.min_price_6w,
       NEW.mfe_pct_6w,NEW.mae_pct_6w,NEW.first_hit_6w,NEW.first_hit_6w_date,NEW.r_multiple_6w,NEW.bars_6w,
       NEW.outcome_6w_note,NEW.outcome_6w_measured_at,NEW.outcome_6w_provenance)
   IS DISTINCT FROM ROW(OLD.trade_bias,OLD.price_at_signal,OLD.signal_at,OLD.stop_loss,OLD.target_1,
       OLD.outcome_6w,OLD.price_after_6w,OLD.price_after_6w_at,OLD.pct_move_6w,OLD.max_price_6w,OLD.min_price_6w,
       OLD.mfe_pct_6w,OLD.mae_pct_6w,OLD.first_hit_6w,OLD.first_hit_6w_date,OLD.r_multiple_6w,OLD.bars_6w,
       OLD.outcome_6w_note,OLD.outcome_6w_measured_at,OLD.outcome_6w_provenance)
 THEN RAISE EXCEPTION 'Verified 6w outcome evidence is immutable'; END IF;
 IF OLD.outcome_12w_provenance IS NOT NULL AND
   ROW(NEW.trade_bias,NEW.price_at_signal,NEW.signal_at,NEW.stop_loss,NEW.target_1,
       NEW.outcome_12w,NEW.price_after_12w,NEW.price_after_12w_at,NEW.pct_move_12w,NEW.max_price_12w,NEW.min_price_12w,
       NEW.mfe_pct_12w,NEW.mae_pct_12w,NEW.first_hit_12w,NEW.first_hit_12w_date,NEW.r_multiple_12w,NEW.bars_12w,
       NEW.outcome_12w_note,NEW.outcome_12w_measured_at,NEW.outcome_12w_provenance)
   IS DISTINCT FROM ROW(OLD.trade_bias,OLD.price_at_signal,OLD.signal_at,OLD.stop_loss,OLD.target_1,
       OLD.outcome_12w,OLD.price_after_12w,OLD.price_after_12w_at,OLD.pct_move_12w,OLD.max_price_12w,OLD.min_price_12w,
       OLD.mfe_pct_12w,OLD.mae_pct_12w,OLD.first_hit_12w,OLD.first_hit_12w_date,OLD.r_multiple_12w,OLD.bars_12w,
       OLD.outcome_12w_note,OLD.outcome_12w_measured_at,OLD.outcome_12w_provenance)
 THEN RAISE EXCEPTION 'Verified 12w outcome evidence is immutable'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ai_horizon_evidence_immutable ON ai_signal_log;
CREATE TRIGGER ai_horizon_evidence_immutable BEFORE UPDATE ON ai_signal_log
 FOR EACH ROW EXECUTE FUNCTION protect_ai_horizon_evidence();
COMMIT;
