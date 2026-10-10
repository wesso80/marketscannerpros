-- Progress for the one-shot equity daily history backfill.
-- The script does not create this table. Apply by hand in Neon before EQUITY_DAILY_BACKFILL=1.
-- Safe to run twice. Does not alter ohlcv_bars.
CREATE TABLE IF NOT EXISTS equity_history_backfill (
  campaign text NOT NULL,
  symbol varchar(20) NOT NULL,
  status text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  provider_oldest date,
  written_from date,
  written_through date,
  inserted_rows int NOT NULL DEFAULT 0,
  volume_repaired int NOT NULL DEFAULT 0,
  provider_zero_volume int NOT NULL DEFAULT 0,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign, symbol),
  CONSTRAINT equity_history_backfill_status CHECK (status IN ('done', 'no_data', 'retry', 'failed'))
);
