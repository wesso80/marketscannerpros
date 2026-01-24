-- Learning Machine tables
-- Run this migration in your Neon PostgreSQL console

CREATE TABLE IF NOT EXISTS learning_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol VARCHAR(20) NOT NULL,
    asset_type VARCHAR(20) NOT NULL DEFAULT 'crypto',
    mode VARCHAR(20) NOT NULL DEFAULT 'forecast',

    -- Prediction snapshot
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_price DECIMAL(20, 8) NOT NULL,
    prediction_direction VARCHAR(20) NOT NULL,
    confidence INT NOT NULL,
    expected_decomp_mins INT,
    target_price DECIMAL(20, 8),
    stop_loss DECIMAL(20, 8),

    -- Context
    stack INT NOT NULL DEFAULT 0,
    active_tfs JSONB,
    hot_zone BOOLEAN NOT NULL DEFAULT false,
    hot_zone_tfs JSONB,
    clusters INT NOT NULL DEFAULT 0,
    mid50_levels JSONB,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_learning_predictions_symbol ON learning_predictions(symbol, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_predictions_status ON learning_predictions(status, created_at DESC);

CREATE TABLE IF NOT EXISTS learning_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prediction_id UUID NOT NULL REFERENCES learning_predictions(id) ON DELETE CASCADE,

    measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    minutes_since_prediction INT NOT NULL,
    price_at_measure DECIMAL(20, 8) NOT NULL,
    move_pct DECIMAL(8, 4) NOT NULL,
    direction VARCHAR(10) NOT NULL, -- up/down/flat

    hit_target BOOLEAN NOT NULL DEFAULT false,
    hit_stop BOOLEAN NOT NULL DEFAULT false,
    outcome_window_mins INT NOT NULL DEFAULT 60
);

CREATE INDEX IF NOT EXISTS idx_learning_outcomes_prediction ON learning_outcomes(prediction_id);
CREATE INDEX IF NOT EXISTS idx_learning_outcomes_measured ON learning_outcomes(measured_at DESC);

CREATE TABLE IF NOT EXISTS learning_stats (
    symbol VARCHAR(20) PRIMARY KEY,
    total_predictions INT NOT NULL DEFAULT 0,
    win_rate DECIMAL(6, 2) NOT NULL DEFAULT 0,
    avg_move_pct DECIMAL(8, 4) NOT NULL DEFAULT 0,
    avg_time_to_move_mins DECIMAL(8, 2) NOT NULL DEFAULT 0,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE learning_predictions IS 'Prediction snapshots for learning outcomes';
COMMENT ON TABLE learning_outcomes IS 'Measured outcomes for predictions';
COMMENT ON TABLE learning_stats IS 'Rolling learning stats per symbol';
