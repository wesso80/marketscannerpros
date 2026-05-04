-- Add feature and cache_hit columns to ai_usage for better observability
-- MEDIUM #24: AI usage logging lacks feature/cache context

ALTER TABLE ai_usage
  ADD COLUMN IF NOT EXISTS feature TEXT,
  ADD COLUMN IF NOT EXISTS cache_hit BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN ai_usage.feature  IS 'Which product feature triggered the AI call (e.g. msp_analyst, portfolio_analyze, journal_analyze)';
COMMENT ON COLUMN ai_usage.cache_hit IS 'Whether the response was served from a cache rather than a fresh LLM call';
