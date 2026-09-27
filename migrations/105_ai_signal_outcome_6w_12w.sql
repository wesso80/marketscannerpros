-- 6-week and 12-week outcome horizons for ai_signal_log (Signal Outcomes, Backtest Lab).
--
-- Additive only: new nullable columns and partial indexes. No DROP, no DELETE, no data change. Safe to run twice.
-- Filled by /api/cron/label-ai-outcomes (lib/outcomes/positionHorizonLabeller.ts), which detects these columns at
-- runtime and skips 6w/12w labelling (with a log line) until this file has been run.
--
-- Horizons are CALENDAR days: 6w = 42 days, 12w = 84 days after signal_at (about 29-30 and 58-60 US trading
-- sessions; 42 and 84 daily bars for crypto). Measured on DAILY bars (high / low / close):
--   window     = daily bars that open after signal_at, up to and including the first bar that closes at or after
--                signal_at + horizon (that bar's close is the exit price)
--   entry      = price_at_signal; stop = stop_loss; target = target_1 (as logged with the call)
--   first_hit  = which of stop / target the window touched first; a single daily bar touching both is
--                'both_same_day' and counted as the stop (conservative)
--   NULL outcome_6w / outcome_12w = pending (horizon not reached yet, or not labelled yet).
ALTER TABLE ai_signal_log
  ADD COLUMN IF NOT EXISTS outcome_6w VARCHAR(20),
  ADD COLUMN IF NOT EXISTS price_after_6w NUMERIC(18,8),
  ADD COLUMN IF NOT EXISTS price_after_6w_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pct_move_6w NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS max_price_6w NUMERIC(18,8),
  ADD COLUMN IF NOT EXISTS min_price_6w NUMERIC(18,8),
  ADD COLUMN IF NOT EXISTS mfe_pct_6w NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS mae_pct_6w NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS first_hit_6w VARCHAR(20),
  ADD COLUMN IF NOT EXISTS first_hit_6w_date DATE,
  ADD COLUMN IF NOT EXISTS r_multiple_6w NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS bars_6w INTEGER,
  ADD COLUMN IF NOT EXISTS outcome_6w_note VARCHAR(120),
  ADD COLUMN IF NOT EXISTS outcome_6w_measured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outcome_12w VARCHAR(20),
  ADD COLUMN IF NOT EXISTS price_after_12w NUMERIC(18,8),
  ADD COLUMN IF NOT EXISTS price_after_12w_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pct_move_12w NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS max_price_12w NUMERIC(18,8),
  ADD COLUMN IF NOT EXISTS min_price_12w NUMERIC(18,8),
  ADD COLUMN IF NOT EXISTS mfe_pct_12w NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS mae_pct_12w NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS first_hit_12w VARCHAR(20),
  ADD COLUMN IF NOT EXISTS first_hit_12w_date DATE,
  ADD COLUMN IF NOT EXISTS r_multiple_12w NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS bars_12w INTEGER,
  ADD COLUMN IF NOT EXISTS outcome_12w_note VARCHAR(120),
  ADD COLUMN IF NOT EXISTS outcome_12w_measured_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ai_signal_outcome_6w_open
  ON ai_signal_log (signal_at)
  WHERE outcome_6w IS NULL;

CREATE INDEX IF NOT EXISTS idx_ai_signal_outcome_12w_open
  ON ai_signal_log (signal_at)
  WHERE outcome_12w IS NULL;

COMMENT ON COLUMN ai_signal_log.outcome_6w IS 'correct / wrong / neutral on the close 42 calendar days after signal_at (1% threshold, LONG/SHORT only); no_data = cannot be measured (see outcome_6w_note); NULL = pending';
COMMENT ON COLUMN ai_signal_log.outcome_12w IS 'correct / wrong / neutral on the close 84 calendar days after signal_at (1% threshold, LONG/SHORT only); no_data = cannot be measured (see outcome_12w_note); NULL = pending';
COMMENT ON COLUMN ai_signal_log.first_hit_6w IS 'target / stop / both_same_day (counted as stop) / neither / no_levels, within the 6w window';
COMMENT ON COLUMN ai_signal_log.first_hit_12w IS 'target / stop / both_same_day (counted as stop) / neither / no_levels, within the 12w window';
COMMENT ON COLUMN ai_signal_log.r_multiple_6w IS 'Bracket result in R (risk = |price_at_signal - stop_loss|): stop first = -1 (worse on a gap), target first = target R, neither = close R at 6w';
COMMENT ON COLUMN ai_signal_log.r_multiple_12w IS 'Bracket result in R (risk = |price_at_signal - stop_loss|): stop first = -1 (worse on a gap), target first = target R, neither = close R at 12w';
COMMENT ON COLUMN ai_signal_log.mfe_pct_6w IS 'Max favourable excursion in the call direction over the 6w window, % of price_at_signal (>= 0 when price moved the called way)';
COMMENT ON COLUMN ai_signal_log.mae_pct_6w IS 'Max adverse excursion against the call over the 6w window, % of price_at_signal (<= 0 when price moved against the call)';
COMMENT ON COLUMN ai_signal_log.mfe_pct_12w IS 'Max favourable excursion in the call direction over the 12w window, % of price_at_signal';
COMMENT ON COLUMN ai_signal_log.mae_pct_12w IS 'Max adverse excursion against the call over the 12w window, % of price_at_signal';
