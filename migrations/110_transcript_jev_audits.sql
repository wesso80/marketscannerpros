-- Jev audit of GPT earnings-call summaries (admin research only). One row per summary version.
-- Each claim in the summary is checked against the same transcript buffer the summariser read. Guardrail only; nothing edits the summary.
CREATE TABLE IF NOT EXISTS transcript_jev_audits (
  summary_id        BIGINT PRIMARY KEY REFERENCES earnings_transcript_summaries(id) ON DELETE CASCADE,
  symbol            TEXT NOT NULL,
  quarter           TEXT NOT NULL,
  version           INTEGER NOT NULL,
  rule              TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('scored','unavailable')),
  claims            JSONB NOT NULL DEFAULT '[]'::jsonb,
  claims_total      INTEGER NOT NULL DEFAULT 0,
  claims_unsupported INTEGER,
  min_support       DOUBLE PRECISION,
  mean_support      DOUBLE PRECISION,
  guidance_stated   DOUBLE PRECISION,
  guidance_invented BOOLEAN,
  surprise_stated   DOUBLE PRECISION,
  surprise_invented BOOLEAN,
  tone_matches      DOUBLE PRECISION,
  transcript_chars  INTEGER,
  model             TEXT,
  input_tokens      INTEGER,
  reason            TEXT,
  checked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS transcript_jev_audits_symbol_idx ON transcript_jev_audits (symbol, quarter, version DESC);
