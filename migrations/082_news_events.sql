-- migrations/082_news_events.sql
-- Persistent news / sentiment events keyed by symbol + ts.
-- Powers the "what's driving this move" section of memos and the
-- daily operator packet's catalyst column. De-duplicated by url hash.

CREATE TABLE IF NOT EXISTS news_events (
  id              BIGSERIAL PRIMARY KEY,
  symbol          VARCHAR(20) NOT NULL,
  source          VARCHAR(64) NOT NULL,         -- 'alpha-vantage-news' | 'edgar' | 'manual'
  url_hash        VARCHAR(64) NOT NULL,         -- sha256 of canonical url
  url             TEXT,
  title           TEXT,
  summary         TEXT,
  sentiment       NUMERIC(6,4),                 -- -1..1 if provided
  sentiment_label VARCHAR(24),                  -- 'bullish' | 'bearish' | 'neutral'
  relevance       NUMERIC(6,4),                 -- 0..1 if provided
  topics          JSONB,                        -- ['earnings','guidance',...]
  published_at    TIMESTAMPTZ NOT NULL,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (symbol, url_hash)
);

CREATE INDEX IF NOT EXISTS idx_news_events_symbol_time
  ON news_events (symbol, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_news_events_published
  ON news_events (published_at DESC);
