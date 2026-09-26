-- Separate outcome horizons for ai_signal_log (used by /api/cron/label-ai-outcomes).
--
-- Before this, the labeller wrote a price taken 4+ hours after the signal into price_after_24h / pct_move_24h.
-- The 4h horizon now has its own columns; *_at records the close time of the bar each price came from.
-- The labeller detects these columns at runtime and skips 4h labelling until this migration is applied.
ALTER TABLE ai_signal_log
  ADD COLUMN IF NOT EXISTS outcome_4h VARCHAR(20),
  ADD COLUMN IF NOT EXISTS price_after_4h NUMERIC(18,8),
  ADD COLUMN IF NOT EXISTS pct_move_4h NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS price_after_4h_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outcome_4h_measured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS price_after_24h_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ai_signal_outcome_4h_open
  ON ai_signal_log (signal_at)
  WHERE outcome_4h IS NULL;

COMMENT ON COLUMN ai_signal_log.outcome_4h IS 'correct / wrong / neutral at the first completed bar close >= signal_at + 4h (LONG/SHORT signals only; NULL = not measured)';
COMMENT ON COLUMN ai_signal_log.price_after_4h_at IS 'Close time of the bar used for price_after_4h';
COMMENT ON COLUMN ai_signal_log.price_after_24h_at IS 'Close time of the bar used for price_after_24h';
