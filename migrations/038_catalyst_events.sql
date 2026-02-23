-- ============================================================
-- Migration 038: catalyst_events
-- Stores every detected catalyst (SEC filing, news, corporate action)
-- with session/anchor metadata for event-study consumption.
-- ============================================================

CREATE TABLE IF NOT EXISTS catalyst_events (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker               VARCHAR(20)  NOT NULL,
  source               VARCHAR(50)  NOT NULL,            -- 'SEC' | 'NEWS' | vendor tag
  headline             TEXT         NOT NULL,
  url                  TEXT,
  catalyst_type        VARCHAR(30)  NOT NULL,            -- CatalystType enum
  catalyst_subtype     VARCHAR(50)  NOT NULL,            -- CatalystSubtype enum
  event_timestamp_utc  TIMESTAMPTZ  NOT NULL,
  event_timestamp_et   TIMESTAMPTZ  NOT NULL,
  session              VARCHAR(20)  NOT NULL,            -- PREMARKET | REGULAR | AFTERHOURS | OVERNIGHT
  anchor_timestamp_et  TIMESTAMPTZ  NOT NULL,
  confidence           DECIMAL(3,2) NOT NULL DEFAULT 0,  -- 0.00–1.00
  severity             VARCHAR(10),                      -- LOW | MED | HIGH
  classification_reason TEXT,                             -- auditable reason string
  raw_payload          JSONB        NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Primary lookup: events for a ticker, most recent first
CREATE INDEX IF NOT EXISTS idx_catalyst_events_ticker_ts
  ON catalyst_events (ticker, event_timestamp_et DESC);

-- Subtype-level studies across all tickers
CREATE INDEX IF NOT EXISTS idx_catalyst_events_subtype_ts
  ON catalyst_events (catalyst_subtype, event_timestamp_et DESC);

-- Full-text / JSON queries on raw payload
CREATE INDEX IF NOT EXISTS idx_catalyst_events_payload
  ON catalyst_events USING gin (raw_payload);

-- Deduplication helper: same ticker + source + timestamp should be rare
CREATE INDEX IF NOT EXISTS idx_catalyst_events_dedup
  ON catalyst_events (ticker, source, event_timestamp_utc);
