-- Migration 055: Wire learning-engine feedback into trade_outcomes
-- Stores tagOutcome() + computeLearningUpdate() results per closed trade.
-- Enables the evolution engine to see per-outcome learning deltas.

ALTER TABLE trade_outcomes ADD COLUMN IF NOT EXISTS learning_label      VARCHAR(16);   -- win|loss|flat|skipped
ALTER TABLE trade_outcomes ADD COLUMN IF NOT EXISTS learning_efficiency  NUMERIC(6,2);  -- mfeR - |maeR|
ALTER TABLE trade_outcomes ADD COLUMN IF NOT EXISTS learning_quality     NUMERIC(6,1);  -- 0-100 composite quality
ALTER TABLE trade_outcomes ADD COLUMN IF NOT EXISTS learning_weight_delta    NUMERIC(8,4); -- evolution weight adjustment
ALTER TABLE trade_outcomes ADD COLUMN IF NOT EXISTS learning_threshold_delta NUMERIC(8,4); -- threshold adjustment
ALTER TABLE trade_outcomes ADD COLUMN IF NOT EXISTS learning_key        VARCHAR(128);  -- SYMBOL|regime|flow|playbook

-- Track when last evolution cycle ran per workspace so we can auto-trigger
ALTER TABLE trade_outcomes ADD COLUMN IF NOT EXISTS learning_processed  BOOLEAN NOT NULL DEFAULT false;

-- Index for finding unprocessed outcomes (auto-evolution trigger)
CREATE INDEX IF NOT EXISTS idx_to_learning_unprocessed
  ON trade_outcomes (workspace_id, learning_processed)
  WHERE learning_processed = false;
