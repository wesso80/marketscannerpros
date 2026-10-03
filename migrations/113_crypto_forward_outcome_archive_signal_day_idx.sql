-- Date-only retention and calibration reads filter on signal_day.
-- crypto_forward_outcome_archive_coin_day_idx leads with coin_id, so it does not serve that filter.
-- Additive and idempotent. Run by hand before or at deploy. No table drops.
-- Does not alter, reference, or read any trading, paper, or arca table.
CREATE INDEX IF NOT EXISTS crypto_forward_outcome_archive_signal_day_idx
  ON crypto_forward_outcome_archive (signal_day);
