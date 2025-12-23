-- Add token tracking columns to ai_usage table
-- For calculating actual OpenAI API costs

ALTER TABLE ai_usage 
ADD COLUMN IF NOT EXISTS prompt_tokens INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS completion_tokens INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_tokens INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS model VARCHAR(50) DEFAULT 'gpt-4o-mini';

-- Create index for cost queries
CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage(created_at DESC);

-- GPT-4o-mini pricing (as of Dec 2024):
-- Input: $0.15 per 1M tokens = $0.00000015 per token
-- Output: $0.60 per 1M tokens = $0.0000006 per token

COMMENT ON COLUMN ai_usage.prompt_tokens IS 'Number of input tokens sent to OpenAI';
COMMENT ON COLUMN ai_usage.completion_tokens IS 'Number of output tokens received from OpenAI';
COMMENT ON COLUMN ai_usage.total_tokens IS 'Total tokens (prompt + completion)';
