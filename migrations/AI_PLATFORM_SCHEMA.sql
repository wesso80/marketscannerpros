-- =====================================================
-- MSP AI PLATFORM LAYER - DATABASE SCHEMA
-- Created: February 2026
-- Purpose: Unified AI infrastructure for all pages
-- =====================================================

-- 1. AI EVENTS TABLE (Telemetry/Analytics)
-- Stores all user interactions for learning and personalization
CREATE TABLE IF NOT EXISTS ai_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB NOT NULL DEFAULT '{}',
    page_context JSONB DEFAULT '{}',
    session_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Indexes for efficient querying
    CONSTRAINT fk_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX idx_ai_events_workspace ON ai_events(workspace_id);
CREATE INDEX idx_ai_events_type ON ai_events(event_type);
CREATE INDEX idx_ai_events_created ON ai_events(created_at DESC);
CREATE INDEX idx_ai_events_session ON ai_events(session_id);

-- Event types enum reference (not enforced, for documentation):
-- page_view, widget_interaction, signal_clicked, ai_opened, ai_question_asked,
-- ai_action_used, outcome_logged, thumbs_up, thumbs_down, user_correction

-- 2. USER MEMORY TABLE (Private per-user preferences)
-- Stores learned preferences and patterns for personalization
CREATE TABLE IF NOT EXISTS user_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL UNIQUE,
    
    -- Trading preferences
    preferred_timeframes JSONB DEFAULT '["1H", "4H", "1D"]',
    preferred_assets JSONB DEFAULT '[]',
    risk_profile VARCHAR(20) DEFAULT 'medium', -- conservative, medium, aggressive
    max_risk_per_trade DECIMAL(5,2) DEFAULT 2.00, -- percentage
    
    -- Learned patterns
    favored_setups JSONB DEFAULT '[]', -- breakouts, mean_reversion, squeeze, momentum
    trading_style VARCHAR(30) DEFAULT 'swing', -- scalp, day, swing, position
    typical_hold_time VARCHAR(30) DEFAULT '1-5 days',
    
    -- AI interaction preferences
    response_verbosity VARCHAR(20) DEFAULT 'balanced', -- brief, balanced, detailed
    show_educational_content BOOLEAN DEFAULT true,
    auto_suggest_actions BOOLEAN DEFAULT true,
    
    -- Behavioral patterns (auto-learned)
    most_used_features JSONB DEFAULT '[]',
    common_scan_filters JSONB DEFAULT '{}',
    downvoted_topics JSONB DEFAULT '[]',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT fk_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX idx_user_memory_workspace ON user_memory(workspace_id);

-- 3. AI RESPONSES TABLE (Training records for improvement)
-- Stores every AI response with context for evaluation and fine-tuning
CREATE TABLE IF NOT EXISTS ai_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    
    -- Request info
    page_skill VARCHAR(50) NOT NULL, -- derivatives, journal, portfolio, scanner, etc.
    user_prompt TEXT NOT NULL,
    
    -- Context snapshot (what AI knew when responding)
    context_snapshot JSONB NOT NULL DEFAULT '{}',
    retrieved_doc_ids JSONB DEFAULT '[]',
    
    -- Response
    model_output TEXT NOT NULL,
    model_used VARCHAR(50) DEFAULT 'gpt-4o-mini',
    tokens_used INTEGER DEFAULT 0,
    latency_ms INTEGER DEFAULT 0,
    
    -- Tools called
    tools_called JSONB DEFAULT '[]',
    actions_suggested JSONB DEFAULT '[]',
    
    -- Outcome tracking
    user_rating INTEGER, -- 1-5 or null
    user_took_action BOOLEAN DEFAULT false,
    action_type VARCHAR(50), -- alert_created, watchlist_added, journal_entry, etc.
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT fk_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX idx_ai_responses_workspace ON ai_responses(workspace_id);
CREATE INDEX idx_ai_responses_skill ON ai_responses(page_skill);
CREATE INDEX idx_ai_responses_rating ON ai_responses(user_rating);
CREATE INDEX idx_ai_responses_created ON ai_responses(created_at DESC);

-- 4. AI FEEDBACK TABLE (Explicit user feedback)
-- Granular feedback on AI responses
CREATE TABLE IF NOT EXISTS ai_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    response_id UUID REFERENCES ai_responses(id) ON DELETE CASCADE,
    
    -- Feedback type
    feedback_type VARCHAR(30) NOT NULL, -- thumbs_up, thumbs_down, correction, flag
    
    -- Detailed feedback (optional)
    feedback_reason VARCHAR(50), -- too_long, too_vague, wrong_data, not_actionable, helpful, accurate
    correction_text TEXT, -- what user thinks it should have said
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT fk_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX idx_ai_feedback_workspace ON ai_feedback(workspace_id);
CREATE INDEX idx_ai_feedback_response ON ai_feedback(response_id);
CREATE INDEX idx_ai_feedback_type ON ai_feedback(feedback_type);

-- 5. AI OUTCOMES TABLE (Trade results for calibration)
-- Links AI recommendations to actual trade outcomes
CREATE TABLE IF NOT EXISTS ai_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    
    -- Link to AI interaction
    response_id UUID REFERENCES ai_responses(id) ON DELETE SET NULL,
    signal_id VARCHAR(100), -- if related to a specific signal
    
    -- Trade details
    symbol VARCHAR(20) NOT NULL,
    direction VARCHAR(10) NOT NULL, -- long, short
    entry_price DECIMAL(20,8) NOT NULL,
    exit_price DECIMAL(20,8),
    
    -- AI prediction at time of trade
    ai_confidence DECIMAL(5,2), -- 0-100
    ai_signal_type VARCHAR(50),
    ai_recommended_action VARCHAR(50),
    
    -- Actual outcome
    pnl_percent DECIMAL(10,4),
    pnl_dollars DECIMAL(20,2),
    max_adverse_excursion DECIMAL(10,4), -- worst drawdown during trade
    max_favorable_excursion DECIMAL(10,4), -- best unrealized gain
    hold_time_hours INTEGER,
    
    -- Was AI right?
    ai_direction_correct BOOLEAN,
    ai_target_hit BOOLEAN,
    
    -- Timestamps
    opened_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT fk_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX idx_ai_outcomes_workspace ON ai_outcomes(workspace_id);
CREATE INDEX idx_ai_outcomes_symbol ON ai_outcomes(symbol);
CREATE INDEX idx_ai_outcomes_confidence ON ai_outcomes(ai_confidence);
CREATE INDEX idx_ai_outcomes_correct ON ai_outcomes(ai_direction_correct);

-- 6. MSP KNOWLEDGE TABLE (RAG chunks for retrieval)
-- Your house methodology, metric definitions, playbooks
CREATE TABLE IF NOT EXISTS msp_knowledge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Content
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    content_type VARCHAR(50) NOT NULL, -- methodology, metric_definition, playbook, faq, edge_case
    
    -- Categorization
    category VARCHAR(50), -- time_confluence, signals, derivatives, portfolio, journal
    tags JSONB DEFAULT '[]',
    
    -- For retrieval
    embedding VECTOR(1536), -- OpenAI ada-002 dimensions
    chunk_index INTEGER DEFAULT 0, -- for multi-chunk documents
    source_doc VARCHAR(200), -- original document name
    
    -- Metadata
    priority INTEGER DEFAULT 5, -- 1-10, higher = more important in retrieval
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_msp_knowledge_type ON msp_knowledge(content_type);
CREATE INDEX idx_msp_knowledge_category ON msp_knowledge(category);
CREATE INDEX idx_msp_knowledge_active ON msp_knowledge(is_active);
-- Vector similarity index (requires pgvector extension)
-- CREATE INDEX idx_msp_knowledge_embedding ON msp_knowledge USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 7. AI ACTIONS LOG (What AI actually did)
-- Tracks when AI performs actions like creating alerts
CREATE TABLE IF NOT EXISTS ai_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    response_id UUID REFERENCES ai_responses(id) ON DELETE SET NULL,
    
    -- Action details
    action_type VARCHAR(50) NOT NULL, -- create_alert, add_watchlist, journal_trade, run_backtest
    action_params JSONB NOT NULL DEFAULT '{}',
    
    -- Result
    success BOOLEAN DEFAULT true,
    result_data JSONB DEFAULT '{}',
    error_message TEXT,
    
    -- User confirmation
    required_confirmation BOOLEAN DEFAULT true,
    user_confirmed BOOLEAN,
    confirmed_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT fk_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX idx_ai_actions_workspace ON ai_actions(workspace_id);
CREATE INDEX idx_ai_actions_type ON ai_actions(action_type);
CREATE INDEX idx_ai_actions_success ON ai_actions(success);

-- 8. AI EVALUATION RESULTS (Weekly eval tracking)
-- Stores results of automated evaluation runs
CREATE TABLE IF NOT EXISTS ai_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Eval run info
    eval_date DATE NOT NULL,
    eval_type VARCHAR(50) NOT NULL, -- accuracy, actionability, verbosity, satisfaction
    
    -- Metrics
    total_samples INTEGER NOT NULL,
    pass_count INTEGER NOT NULL,
    fail_count INTEGER NOT NULL,
    score DECIMAL(5,2) NOT NULL, -- 0-100
    
    -- Details
    failed_cases JSONB DEFAULT '[]',
    notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ai_evaluations_date ON ai_evaluations(eval_date DESC);
CREATE INDEX idx_ai_evaluations_type ON ai_evaluations(eval_type);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to update user memory timestamp
CREATE OR REPLACE FUNCTION update_user_memory_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_user_memory_updated
    BEFORE UPDATE ON user_memory
    FOR EACH ROW
    EXECUTE FUNCTION update_user_memory_timestamp();

-- Function to auto-create user memory on first AI interaction
CREATE OR REPLACE FUNCTION ensure_user_memory(p_workspace_id UUID)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO user_memory (workspace_id)
    VALUES (p_workspace_id)
    ON CONFLICT (workspace_id) DO NOTHING
    RETURNING id INTO v_id;
    
    IF v_id IS NULL THEN
        SELECT id INTO v_id FROM user_memory WHERE workspace_id = p_workspace_id;
    END IF;
    
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- INITIAL KNOWLEDGE BASE SEED DATA
-- =====================================================

-- Time Confluence methodology
INSERT INTO msp_knowledge (title, content, content_type, category, tags, priority) VALUES
('Time Confluence Overview', 
'Time Confluence is MSP''s core methodology for identifying high-probability trade setups. It analyzes when multiple timeframes are simultaneously reaching their 50% retracement levels (decompression points). When 3+ timeframes align at their 50% levels within a short window, liquidity tends to shift and significant price moves often follow. The scanner tracks 1m, 5m, 15m, 1H, 4H, and 1D candles and alerts when confluence is building.',
'methodology', 'time_confluence', '["core", "signals", "confluence"]', 10),

('50% Level Decompression',
'The 50% level represents the equilibrium point of any candle or range. When price returns to this level, it''s "decompressing" - releasing built-up directional pressure. Multiple timeframes decompressing simultaneously suggests a major liquidity event is imminent. This is NOT a guarantee of direction, but rather a timing indicator for when moves are likely to occur.',
'methodology', 'time_confluence', '["50_level", "decompression", "timing"]', 9),

('Signal Confidence Scoring',
'MSP signals use a composite confidence score (0-100) based on: trend alignment across timeframes (25%), volume confirmation (20%), momentum indicators like RSI/MACD (20%), support/resistance proximity (15%), and market regime context (20%). Scores above 75 are considered high confidence. Always check the component breakdown to understand what''s driving the score.',
'metric_definition', 'signals', '["confidence", "scoring", "components"]', 9),

('Derivatives Dashboard Interpretation',
'Open Interest (OI) changes indicate new money entering (rising OI) or exiting (falling OI) the market. Rising OI + Rising Price = Bullish. Rising OI + Falling Price = Bearish. Falling OI = Position unwinding. Funding rates above 0.1% suggest overleveraged longs; below -0.1% suggests overleveraged shorts. Liquidation heatmaps show where stop-losses cluster.',
'metric_definition', 'derivatives', '["open_interest", "funding", "liquidations"]', 8),

('IV Rank and Percentile',
'IV Rank shows where current implied volatility sits relative to the past year (0-100). IV Percentile shows the percentage of days IV was lower than today. High IV Rank (>50) suggests options are expensive - consider selling premium. Low IV Rank (<30) suggests options are cheap - consider buying premium. Always pair IV analysis with directional bias.',
'metric_definition', 'options', '["iv_rank", "volatility", "options"]', 8),

('Trade Journal Best Practices',
'Every journal entry should capture: 1) Setup type (breakout, pullback, reversal, squeeze), 2) Entry reasoning, 3) Risk management (stop, targets), 4) Emotional state, 5) What you''d do differently. Tag mistakes consistently: FOMO, early_exit, moved_stop, no_plan, oversize. Weekly review of mistake patterns is more valuable than P/L tracking.',
'playbook', 'journal', '["journaling", "review", "mistakes"]', 7),

('Position Sizing Formula',
'Risk-based position sizing: Position Size = (Account × Risk%) / (Entry - Stop). Never risk more than 1-2% per trade. If your calculated position is larger than comfortable, reduce it. Account for correlation - 3 similar positions = 3x the risk. Scale into positions rather than going all-in.',
'playbook', 'portfolio', '["position_sizing", "risk_management"]', 9),

('When Signals Conflict',
'If short-term bullish but long-term bearish: 1) Reduce position size, 2) Tighten stops, 3) Take profits earlier, 4) Consider it a counter-trend trade. If signals conflict across indicators: wait for clarity or use the higher timeframe as the tiebreaker. Conflicting signals often precede range-bound conditions.',
'edge_case', 'signals', '["conflicts", "multi_timeframe"]', 8);

-- Grant permissions if needed
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO your_app_user;
