-- =====================================================================
-- AI Signal Log — Edge Learning Memory
-- Tracks every AI verdict with outcome tracking for continuous improvement
-- =====================================================================

CREATE TABLE IF NOT EXISTS ai_signal_log (
    id BIGSERIAL PRIMARY KEY,
    workspace_id TEXT NOT NULL,

    -- Signal context
    symbol VARCHAR(30) NOT NULL,
    asset_type VARCHAR(20) NOT NULL DEFAULT 'equity',  -- equity, crypto, forex, commodity
    timeframe VARCHAR(10),

    -- AI decision snapshot
    signal_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    regime VARCHAR(40) NOT NULL,           -- TREND_UP, RANGE_NEUTRAL, VOL_EXPANSION, etc.
    confluence_score INT NOT NULL CHECK (confluence_score BETWEEN 0 AND 100),
    confidence INT NOT NULL CHECK (confidence BETWEEN 0 AND 100),
    verdict VARCHAR(30) NOT NULL,          -- TRADE_READY, CONDITIONAL, WATCH, NO_TRADE
    trade_bias VARCHAR(20),               -- LONG, SHORT, NEUTRAL
    
    -- Price at signal
    price_at_signal NUMERIC(18,8),
    entry_price NUMERIC(18,8),
    stop_loss NUMERIC(18,8),
    target_1 NUMERIC(18,8),
    target_2 NUMERIC(18,8),

    -- Decision trace snapshot (JSON for flexibility)
    decision_trace JSONB,

    -- Outcome (filled by outcome job later)
    outcome VARCHAR(20) DEFAULT 'pending',   -- pending, correct, wrong, neutral, expired
    price_after_24h NUMERIC(18,8),
    pct_move_24h NUMERIC(10,4),
    outcome_measured_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance queries
CREATE INDEX IF NOT EXISTS idx_ai_signal_workspace ON ai_signal_log(workspace_id, signal_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_signal_symbol ON ai_signal_log(symbol, signal_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_signal_regime ON ai_signal_log(regime, outcome);
CREATE INDEX IF NOT EXISTS idx_ai_signal_outcome ON ai_signal_log(outcome, signal_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_signal_verdict ON ai_signal_log(verdict, signal_at DESC);

-- Prevent duplicate signals (same workspace, symbol, timeframe within 1 hour)
-- App-level dedup: check before insert

COMMENT ON TABLE ai_signal_log IS 'AI signal memory for edge learning — tracks every ARCA verdict with outcome';
COMMENT ON COLUMN ai_signal_log.decision_trace IS 'JSON snapshot of the 9-layer decision trace at signal time';
COMMENT ON COLUMN ai_signal_log.outcome IS 'Filled by outcome measurement job: correct if price moved in trade_bias direction >1%';
