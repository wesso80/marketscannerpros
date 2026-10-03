-- Daily BTC dominance (percent of total crypto market cap) from the first successful CoinGecko /global
-- read of each UTC day. Admin crypto summary only. Idempotent: safe to run more than once.
-- Brad runs this himself. The market-data job and the summary endpoint both tolerate the table being absent.
CREATE TABLE IF NOT EXISTS crypto_btc_dominance_daily (
  day         DATE PRIMARY KEY,
  value       NUMERIC NOT NULL,
  source      TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
