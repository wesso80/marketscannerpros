-- Jev verification stamps for stored equity catalyst headlines (admin research only). One row per catalyst event.
-- Probabilities are Jev's calibrated answers to fixed questions; outcome columns are filled later from the worker's daily bars.
CREATE TABLE IF NOT EXISTS news_jev_stamps (
  event_id        UUID PRIMARY KEY REFERENCES catalyst_events(id) ON DELETE CASCADE,
  ticker          TEXT NOT NULL,
  rule            TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('scored','unavailable')),
  about_company   DOUBLE PRECISION,
  price_material  DOUBLE PRECISION,
  direction       TEXT,
  direction_probs JSONB,
  direction_conf  DOUBLE PRECISION,
  event_type      TEXT,
  event_type_conf DOUBLE PRECISION,
  model           TEXT,
  input_tokens    INTEGER,
  reason          TEXT,
  company_name    TEXT,
  event_at        TIMESTAMPTZ NOT NULL,
  checked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prior_close     DOUBLE PRECISION,
  next_close      DOUBLE PRECISION,
  return_pct      DOUBLE PRECISION,
  labelled_at     TIMESTAMPTZ,
  label_reason    TEXT
);
CREATE INDEX IF NOT EXISTS news_jev_stamps_pending_label_idx ON news_jev_stamps (labelled_at, event_at) WHERE labelled_at IS NULL;
CREATE INDEX IF NOT EXISTS news_jev_stamps_ticker_idx ON news_jev_stamps (ticker, event_at DESC);
