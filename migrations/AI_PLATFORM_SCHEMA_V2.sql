-- =====================================================
-- MSP AI PLATFORM LAYER - SCHEMA V2 MIGRATIONS
-- Created: February 2026
-- Purpose: Enhanced columns for production-grade AI layer
-- Run AFTER AI_PLATFORM_SCHEMA.sql
-- =====================================================

-- =====================================================
-- 1. AI EVENTS TABLE ENHANCEMENTS
-- =====================================================

-- Add timestamp tracking and anonymous user support
ALTER TABLE ai_events ADD COLUMN IF NOT EXISTS client_ts TIMESTAMP WITH TIME ZONE;
ALTER TABLE ai_events ADD COLUMN IF NOT EXISTS server_ts TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE ai_events ADD COLUMN IF NOT EXISTS anonymous_user_id VARCHAR(100);

-- Add learning signal labels
ALTER TABLE ai_events ADD COLUMN IF NOT EXISTS label_type VARCHAR(20); -- implicit, explicit, outcome
ALTER TABLE ai_events ADD COLUMN IF NOT EXISTS label_strength VARCHAR(20); -- weak, medium, strong
ALTER TABLE ai_events ADD COLUMN IF NOT EXISTS label_signal VARCHAR(20); -- positive, negative, neutral

CREATE INDEX IF NOT EXISTS idx_ai_events_label_type ON ai_events(label_type);
CREATE INDEX IF NOT EXISTS idx_ai_events_client_ts ON ai_events(client_ts DESC);

-- =====================================================
-- 2. AI RESPONSES TABLE ENHANCEMENTS
-- =====================================================

-- Add versioning
ALTER TABLE ai_responses ADD COLUMN IF NOT EXISTS context_version VARCHAR(20) DEFAULT 'v1';
ALTER TABLE ai_responses ADD COLUMN IF NOT EXISTS skill_version VARCHAR(50);
ALTER TABLE ai_responses ADD COLUMN IF NOT EXISTS input_hash VARCHAR(64);

-- Add detailed token tracking
ALTER TABLE ai_responses ADD COLUMN IF NOT EXISTS token_prompt INTEGER DEFAULT 0;
ALTER TABLE ai_responses ADD COLUMN IF NOT EXISTS token_completion INTEGER DEFAULT 0;

-- Add retrieval metadata for RAG debugging
ALTER TABLE ai_responses ADD COLUMN IF NOT EXISTS retrieval_doc_ids JSONB DEFAULT '[]';
ALTER TABLE ai_responses ADD COLUMN IF NOT EXISTS retrieval_snippets_hash VARCHAR(64);
ALTER TABLE ai_responses ADD COLUMN IF NOT EXISTS retrieval_query TEXT;
ALTER TABLE ai_responses ADD COLUMN IF NOT EXISTS retrieval_latency_ms INTEGER DEFAULT 0;
ALTER TABLE ai_responses ADD COLUMN IF NOT EXISTS documents_considered INTEGER DEFAULT 0;
ALTER TABLE ai_responses ADD COLUMN IF NOT EXISTS documents_used INTEGER DEFAULT 0;

-- Add confidence metadata
ALTER TABLE ai_responses ADD COLUMN IF NOT EXISTS confidence_value DECIMAL(5,2);
ALTER TABLE ai_responses ADD COLUMN IF NOT EXISTS confidence_type VARCHAR(30); -- model_calibrated, heuristic, ranking_score, composite
ALTER TABLE ai_responses ADD COLUMN IF NOT EXISTS confidence_horizon VARCHAR(20); -- 1h, 4h, 24h, next_session, 5d
ALTER TABLE ai_responses ADD COLUMN IF NOT EXISTS confidence_components JSONB DEFAULT '[]';

-- Add tool calls as structured JSON
ALTER TABLE ai_responses ADD COLUMN IF NOT EXISTS tool_calls_json JSONB DEFAULT '[]';

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_ai_responses_context_version ON ai_responses(context_version);
CREATE INDEX IF NOT EXISTS idx_ai_responses_skill_version ON ai_responses(skill_version);
CREATE INDEX IF NOT EXISTS idx_ai_responses_input_hash ON ai_responses(input_hash);
CREATE INDEX IF NOT EXISTS idx_ai_responses_confidence ON ai_responses(confidence_value);

-- =====================================================
-- 3. AI ACTIONS TABLE ENHANCEMENTS
-- =====================================================

-- Add idempotency and audit trail
ALTER TABLE ai_actions ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);
ALTER TABLE ai_actions ADD COLUMN IF NOT EXISTS initiated_by VARCHAR(20) DEFAULT 'user'; -- user, ai
ALTER TABLE ai_actions ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'executed'; -- pending, confirmed, executed, failed, cancelled
ALTER TABLE ai_actions ADD COLUMN IF NOT EXISTS error_code VARCHAR(50);
ALTER TABLE ai_actions ADD COLUMN IF NOT EXISTS dry_run BOOLEAN DEFAULT false;
ALTER TABLE ai_actions ADD COLUMN IF NOT EXISTS dry_run_result JSONB DEFAULT '{}';

-- Add rate limiting tracking
ALTER TABLE ai_actions ADD COLUMN IF NOT EXISTS tool_cost_level VARCHAR(20); -- free, low, medium, high
ALTER TABLE ai_actions ADD COLUMN IF NOT EXISTS execution_time_ms INTEGER DEFAULT 0;

-- Create unique constraint on idempotency key (per workspace)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_actions_idempotency 
ON ai_actions(workspace_id, idempotency_key) 
WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_actions_status ON ai_actions(status);
CREATE INDEX IF NOT EXISTS idx_ai_actions_initiated_by ON ai_actions(initiated_by);

-- =====================================================
-- 4. AI FEEDBACK TABLE ENHANCEMENTS
-- =====================================================

-- Add learning signal categorization
ALTER TABLE ai_feedback ADD COLUMN IF NOT EXISTS label_type VARCHAR(20) DEFAULT 'explicit'; -- implicit, explicit, outcome
ALTER TABLE ai_feedback ADD COLUMN IF NOT EXISTS label_strength VARCHAR(20) DEFAULT 'medium'; -- weak, medium, strong
ALTER TABLE ai_feedback ADD COLUMN IF NOT EXISTS topic VARCHAR(100); -- What topic was the feedback about
ALTER TABLE ai_feedback ADD COLUMN IF NOT EXISTS page_skill VARCHAR(50); -- Which page skill generated the response

CREATE INDEX IF NOT EXISTS idx_ai_feedback_topic ON ai_feedback(topic);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_skill ON ai_feedback(page_skill);

-- =====================================================
-- 5. AI OUTCOMES TABLE ENHANCEMENTS
-- =====================================================

-- Add confidence calibration tracking
ALTER TABLE ai_outcomes ADD COLUMN IF NOT EXISTS ai_confidence_type VARCHAR(30);
ALTER TABLE ai_outcomes ADD COLUMN IF NOT EXISTS ai_confidence_horizon VARCHAR(20);
ALTER TABLE ai_outcomes ADD COLUMN IF NOT EXISTS ai_prediction_details JSONB DEFAULT '{}';

-- Was AI calibrated? (for feedback loop)
ALTER TABLE ai_outcomes ADD COLUMN IF NOT EXISTS calibration_error DECIMAL(10,4); -- How far off was confidence from actual
ALTER TABLE ai_outcomes ADD COLUMN IF NOT EXISTS within_target_range BOOLEAN;

CREATE INDEX IF NOT EXISTS idx_ai_outcomes_calibration ON ai_outcomes(calibration_error);

-- =====================================================
-- 6. USER MEMORY ENHANCEMENTS
-- =====================================================

-- Add AI interaction preferences
ALTER TABLE user_memory ADD COLUMN IF NOT EXISTS ai_suggestions_enabled BOOLEAN DEFAULT true;
ALTER TABLE user_memory ADD COLUMN IF NOT EXISTS preferred_confidence_display VARCHAR(30) DEFAULT 'percentage'; -- percentage, stars, words
ALTER TABLE user_memory ADD COLUMN IF NOT EXISTS auto_execute_low_risk_actions BOOLEAN DEFAULT false;

-- Add learning from outcomes
ALTER TABLE user_memory ADD COLUMN IF NOT EXISTS tracked_signals JSONB DEFAULT '[]'; -- Signals user is tracking
ALTER TABLE user_memory ADD COLUMN IF NOT EXISTS signal_accuracy_history JSONB DEFAULT '{}'; -- Per-signal-type accuracy

-- =====================================================
-- 7. EXPLAIN CACHE TABLE (NEW)
-- For caching expensive explain_metric responses
-- =====================================================

CREATE TABLE IF NOT EXISTS ai_explain_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cache_key VARCHAR(200) NOT NULL UNIQUE,
    
    -- Request info
    metric_name VARCHAR(100) NOT NULL,
    metric_value_bucket VARCHAR(50), -- Bucketed value for cache hit (e.g., "0-10", "10-20")
    skill VARCHAR(50) NOT NULL,
    
    -- Response
    explanation TEXT NOT NULL,
    why_it_matters TEXT,
    actionable_insight TEXT,
    
    -- Cache metadata
    hit_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    CONSTRAINT valid_cache_key CHECK (cache_key <> '')
);

CREATE INDEX IF NOT EXISTS idx_explain_cache_key ON ai_explain_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_explain_cache_expires ON ai_explain_cache(expires_at);

-- =====================================================
-- 8. RATE LIMITING TABLE (NEW)
-- Track tool usage for rate limiting
-- =====================================================

CREATE TABLE IF NOT EXISTS ai_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    tool_name VARCHAR(50) NOT NULL,
    
    -- Rolling counts
    minute_count INTEGER DEFAULT 0,
    hour_count INTEGER DEFAULT 0,
    day_count INTEGER DEFAULT 0,
    
    -- Windows
    minute_window_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    hour_window_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    day_window_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Last action
    last_action_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Cost tracking
    tokens_used_today INTEGER DEFAULT 0,
    
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT fk_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    CONSTRAINT unique_workspace_tool UNIQUE (workspace_id, tool_name)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_workspace ON ai_rate_limits(workspace_id);

-- =====================================================
-- 9. AI SUGGESTIONS TABLE (NEW)
-- Pre-computed "next best actions" for quick retrieval
-- =====================================================

CREATE TABLE IF NOT EXISTS ai_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    
    -- Context
    page_skill VARCHAR(50) NOT NULL,
    trigger_context JSONB NOT NULL DEFAULT '{}', -- What triggered this suggestion
    
    -- Suggestion
    suggestion_type VARCHAR(50) NOT NULL, -- action, insight, warning, opportunity
    title VARCHAR(200) NOT NULL,
    description TEXT,
    priority VARCHAR(20) DEFAULT 'medium', -- high, medium, low
    
    -- Action (if actionable)
    tool_name VARCHAR(50),
    tool_params JSONB DEFAULT '{}',
    idempotency_key VARCHAR(100),
    
    -- Validity
    valid_until TIMESTAMP WITH TIME ZONE,
    is_dismissed BOOLEAN DEFAULT false,
    dismissed_at TIMESTAMP WITH TIME ZONE,
    is_acted_on BOOLEAN DEFAULT false,
    acted_on_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT fk_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_suggestions_workspace ON ai_suggestions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_skill ON ai_suggestions(page_skill);
CREATE INDEX IF NOT EXISTS idx_suggestions_valid ON ai_suggestions(valid_until) WHERE NOT is_dismissed;

-- =====================================================
-- 10. HELPER FUNCTIONS
-- =====================================================

-- Function to increment rate limit counters
CREATE OR REPLACE FUNCTION increment_rate_limit(
    p_workspace_id UUID,
    p_tool_name VARCHAR(50),
    p_tokens_used INTEGER DEFAULT 0
)
RETURNS TABLE(
    is_minute_limited BOOLEAN,
    is_hour_limited BOOLEAN,
    minute_count INTEGER,
    hour_count INTEGER
) AS $$
DECLARE
    v_row ai_rate_limits%ROWTYPE;
    v_now TIMESTAMP WITH TIME ZONE := NOW();
BEGIN
    -- Get or create rate limit row
    INSERT INTO ai_rate_limits (workspace_id, tool_name)
    VALUES (p_workspace_id, p_tool_name)
    ON CONFLICT (workspace_id, tool_name) DO NOTHING;
    
    SELECT * INTO v_row FROM ai_rate_limits 
    WHERE workspace_id = p_workspace_id AND tool_name = p_tool_name;
    
    -- Reset minute window if expired (60 seconds)
    IF v_now - v_row.minute_window_start > INTERVAL '1 minute' THEN
        v_row.minute_count := 0;
        v_row.minute_window_start := v_now;
    END IF;
    
    -- Reset hour window if expired
    IF v_now - v_row.hour_window_start > INTERVAL '1 hour' THEN
        v_row.hour_count := 0;
        v_row.hour_window_start := v_now;
    END IF;
    
    -- Reset day window if expired
    IF v_now - v_row.day_window_start > INTERVAL '1 day' THEN
        v_row.day_count := 0;
        v_row.tokens_used_today := 0;
        v_row.day_window_start := v_now;
    END IF;
    
    -- Increment counters
    v_row.minute_count := v_row.minute_count + 1;
    v_row.hour_count := v_row.hour_count + 1;
    v_row.day_count := v_row.day_count + 1;
    v_row.tokens_used_today := v_row.tokens_used_today + p_tokens_used;
    v_row.last_action_at := v_now;
    v_row.updated_at := v_now;
    
    -- Update the row
    UPDATE ai_rate_limits SET
        minute_count = v_row.minute_count,
        hour_count = v_row.hour_count,
        day_count = v_row.day_count,
        minute_window_start = v_row.minute_window_start,
        hour_window_start = v_row.hour_window_start,
        day_window_start = v_row.day_window_start,
        tokens_used_today = v_row.tokens_used_today,
        last_action_at = v_row.last_action_at,
        updated_at = v_row.updated_at
    WHERE workspace_id = p_workspace_id AND tool_name = p_tool_name;
    
    -- Return current state (limits are checked by caller based on tool policy)
    RETURN QUERY SELECT 
        FALSE AS is_minute_limited, -- Caller checks against policy
        FALSE AS is_hour_limited,
        v_row.minute_count,
        v_row.hour_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get or set cached explanation
CREATE OR REPLACE FUNCTION get_or_cache_explanation(
    p_cache_key VARCHAR(200),
    p_metric_name VARCHAR(100),
    p_value_bucket VARCHAR(50),
    p_skill VARCHAR(50),
    p_ttl_seconds INTEGER DEFAULT 3600
)
RETURNS TABLE(
    cache_hit BOOLEAN,
    explanation TEXT,
    why_it_matters TEXT,
    actionable_insight TEXT
) AS $$
DECLARE
    v_row ai_explain_cache%ROWTYPE;
BEGIN
    -- Try to find valid cache entry
    SELECT * INTO v_row FROM ai_explain_cache 
    WHERE cache_key = p_cache_key AND expires_at > NOW();
    
    IF FOUND THEN
        -- Increment hit count
        UPDATE ai_explain_cache SET hit_count = hit_count + 1 WHERE cache_key = p_cache_key;
        
        RETURN QUERY SELECT 
            TRUE,
            v_row.explanation,
            v_row.why_it_matters,
            v_row.actionable_insight;
    ELSE
        -- No cache hit - caller needs to generate and insert
        RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Clean up expired cache entries (run periodically)
CREATE OR REPLACE FUNCTION cleanup_explain_cache()
RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM ai_explain_cache WHERE expires_at < NOW();
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON COLUMN ai_responses.context_version IS 'Version of the context builder schema (e.g., v1)';
COMMENT ON COLUMN ai_responses.skill_version IS 'Version of the page skill config (e.g., derivatives@1.2)';
COMMENT ON COLUMN ai_responses.input_hash IS 'SHA256 hash of user prompt + context for deduplication';
COMMENT ON COLUMN ai_responses.confidence_type IS 'model_calibrated=from training data, heuristic=rule-based, ranking_score=relative, composite=combined';
COMMENT ON COLUMN ai_responses.confidence_horizon IS 'Time window the confidence applies to (e.g., 24h, next_session)';

COMMENT ON COLUMN ai_actions.idempotency_key IS 'Hash of workspace_id + tool + params to prevent duplicates';
COMMENT ON COLUMN ai_actions.status IS 'pending=awaiting confirm, confirmed=user approved, executed=done, failed=error, cancelled=user rejected';
COMMENT ON COLUMN ai_actions.dry_run IS 'If true, shows what would happen without executing';

COMMENT ON COLUMN ai_events.label_type IS 'implicit=inferred from behavior, explicit=direct feedback, outcome=trade result';
COMMENT ON COLUMN ai_events.label_strength IS 'How strong of a learning signal this is';

COMMENT ON TABLE ai_explain_cache IS 'Cache for expensive explain_metric calls. Keyed by metric+skill+value_bucket';
COMMENT ON TABLE ai_rate_limits IS 'Rolling window rate limit tracking per workspace per tool';
COMMENT ON TABLE ai_suggestions IS 'Pre-computed AI suggestions for quick "next best action" retrieval';
