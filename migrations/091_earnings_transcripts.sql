-- 091_earnings_transcripts.sql
-- Earnings call transcripts + LLM-derived summaries.
--
-- earnings_transcripts: raw transcript content per (symbol, quarter)
--   pulled from Alpha Vantage EARNINGS_CALL_TRANSCRIPT.
-- earnings_transcript_summaries: LLM-derived structured summary
--   (key themes, guidance changes, tone, surprise sentiment) versioned
--   so re-summarisation never overwrites history.

CREATE TABLE IF NOT EXISTS earnings_transcripts (
  id BIGSERIAL PRIMARY KEY,
  symbol VARCHAR(16) NOT NULL,
  quarter VARCHAR(10) NOT NULL, -- e.g. '2025Q4'
  transcript JSONB NOT NULL,    -- AV returns array of {speaker, title, content, sentiment}
  speaker_count INTEGER,
  word_count INTEGER,
  source VARCHAR(32) NOT NULL DEFAULT 'alphavantage',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS earnings_transcripts_unique_idx
  ON earnings_transcripts (symbol, quarter);
CREATE INDEX IF NOT EXISTS earnings_transcripts_symbol_idx
  ON earnings_transcripts (symbol, fetched_at DESC);

CREATE TABLE IF NOT EXISTS earnings_transcript_summaries (
  id BIGSERIAL PRIMARY KEY,
  symbol VARCHAR(16) NOT NULL,
  quarter VARCHAR(10) NOT NULL,
  model VARCHAR(64) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  summary JSONB NOT NULL,         -- {keyThemes:[], guidanceChanges:[], tone, surpriseDirection, redFlags:[], oneLiner}
  tone VARCHAR(16),               -- bullish|bearish|mixed|neutral
  surprise_direction VARCHAR(16), -- beat|miss|in_line|unknown
  source_freshness VARCHAR(16),   -- real-time|delayed|stale|unknown
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS transcript_summaries_lookup_idx
  ON earnings_transcript_summaries (symbol, quarter, version DESC);
