-- Persist indicator warmup/readiness metadata for DB-backed indicator reads
ALTER TABLE indicators_latest
ADD COLUMN IF NOT EXISTS warmup_json JSONB;

CREATE INDEX IF NOT EXISTS idx_indicators_latest_warmup_json
ON indicators_latest USING GIN (warmup_json);
