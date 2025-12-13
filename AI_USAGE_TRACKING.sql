-- AI Usage Tracking Table
-- Run this SQL in your Vercel Postgres database

CREATE TABLE IF NOT EXISTS ai_usage (
    id SERIAL PRIMARY KEY,
    workspace_id UUID NOT NULL,
    question TEXT NOT NULL,
    response_length INTEGER NOT NULL,
    tier VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    INDEX idx_workspace_date (workspace_id, created_at)
);

-- Create index for efficient daily usage queries
CREATE INDEX IF NOT EXISTS idx_ai_usage_workspace_date 
ON ai_usage (workspace_id, DATE(created_at));

-- Query to check today's usage for a workspace
-- SELECT COUNT(*) FROM ai_usage 
-- WHERE workspace_id = 'YOUR_WORKSPACE_ID' 
-- AND DATE(created_at) = CURRENT_DATE;

-- Query to see usage breakdown by tier
-- SELECT tier, COUNT(*) as questions, 
--        AVG(response_length) as avg_response_length
-- FROM ai_usage 
-- WHERE DATE(created_at) = CURRENT_DATE
-- GROUP BY tier;
