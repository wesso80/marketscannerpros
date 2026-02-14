-- =====================================================
-- AI ACTIONS EXECUTOR HARDENING
-- Ensures ai_actions supports policy-enforced execution pipeline:
-- pending -> confirmed -> executed/failed/cancelled
-- =====================================================

-- Core state machine + idempotency metadata
ALTER TABLE ai_actions ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);
ALTER TABLE ai_actions ADD COLUMN IF NOT EXISTS initiated_by VARCHAR(20) DEFAULT 'user';
ALTER TABLE ai_actions ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'executed';
ALTER TABLE ai_actions ADD COLUMN IF NOT EXISTS dry_run BOOLEAN DEFAULT false;
ALTER TABLE ai_actions ADD COLUMN IF NOT EXISTS dry_run_result JSONB DEFAULT '{}';

-- Confirmation + execution metadata
ALTER TABLE ai_actions ADD COLUMN IF NOT EXISTS required_confirmation BOOLEAN DEFAULT true;
ALTER TABLE ai_actions ADD COLUMN IF NOT EXISTS user_confirmed BOOLEAN;
ALTER TABLE ai_actions ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE ai_actions ADD COLUMN IF NOT EXISTS executed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE ai_actions ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;

-- Error + cost metadata
ALTER TABLE ai_actions ADD COLUMN IF NOT EXISTS error_code VARCHAR(50);
ALTER TABLE ai_actions ADD COLUMN IF NOT EXISTS tool_cost_level VARCHAR(20);
ALTER TABLE ai_actions ADD COLUMN IF NOT EXISTS execution_time_ms INTEGER DEFAULT 0;

-- Ensure result payload columns exist (for older installs)
ALTER TABLE ai_actions ADD COLUMN IF NOT EXISTS success BOOLEAN DEFAULT true;
ALTER TABLE ai_actions ADD COLUMN IF NOT EXISTS result_data JSONB DEFAULT '{}';
ALTER TABLE ai_actions ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Status domain guard (idempotent-safe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_ai_actions_status'
  ) THEN
    ALTER TABLE ai_actions
      ADD CONSTRAINT chk_ai_actions_status
      CHECK (status IN ('pending', 'confirmed', 'executed', 'failed', 'cancelled'));
  END IF;
END $$;

-- Cost level guard
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_ai_actions_cost_level'
  ) THEN
    ALTER TABLE ai_actions
      ADD CONSTRAINT chk_ai_actions_cost_level
      CHECK (tool_cost_level IS NULL OR tool_cost_level IN ('free', 'low', 'medium', 'high'));
  END IF;
END $$;

-- Idempotency uniqueness per workspace
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_actions_workspace_idempotency
  ON ai_actions(workspace_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Query-performance indexes for executor/status checks
CREATE INDEX IF NOT EXISTS idx_ai_actions_workspace_status_created
  ON ai_actions(workspace_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_actions_workspace_type_created
  ON ai_actions(workspace_id, action_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_actions_response_id
  ON ai_actions(response_id)
  WHERE response_id IS NOT NULL;

-- =====================================================
-- Legacy Row Backfill (safe/idempotent)
-- =====================================================

-- Normalize null statuses from older rows
UPDATE ai_actions
SET status = CASE
  WHEN success = true THEN 'executed'
  WHEN success = false THEN 'failed'
  ELSE 'executed'
END
WHERE status IS NULL OR status = '';

-- Fill required_confirmation when missing
UPDATE ai_actions
SET required_confirmation = COALESCE(required_confirmation, true)
WHERE required_confirmation IS NULL;

-- Fill user_confirmed defaults based on status for historical rows
UPDATE ai_actions
SET user_confirmed = CASE
  WHEN status IN ('executed', 'confirmed') THEN true
  WHEN status IN ('pending', 'failed', 'cancelled') THEN COALESCE(user_confirmed, false)
  ELSE COALESCE(user_confirmed, false)
END
WHERE user_confirmed IS NULL;

-- Set confirmed_at for rows that are confirmed/executed and already user-confirmed
UPDATE ai_actions
SET confirmed_at = COALESCE(confirmed_at, created_at)
WHERE user_confirmed = true
  AND status IN ('confirmed', 'executed')
  AND confirmed_at IS NULL;

-- Set executed_at for completed rows
UPDATE ai_actions
SET executed_at = COALESCE(executed_at, created_at)
WHERE status IN ('executed', 'failed')
  AND executed_at IS NULL;

-- Set cancelled_at for cancelled rows
UPDATE ai_actions
SET cancelled_at = COALESCE(cancelled_at, created_at)
WHERE status = 'cancelled'
  AND cancelled_at IS NULL;

-- Fill dry_run defaults when null
UPDATE ai_actions
SET dry_run = COALESCE(dry_run, false)
WHERE dry_run IS NULL;

-- Fill tool cost labels for historical rows where possible
UPDATE ai_actions
SET tool_cost_level = COALESCE(tool_cost_level,
  CASE
    WHEN action_type IN ('run_backtest') THEN 'high'
    WHEN action_type IN ('generate_trade_plan', 'compare_assets') THEN 'medium'
    WHEN action_type IN ('create_alert', 'add_to_watchlist', 'remove_from_watchlist', 'journal_trade') THEN 'low'
    ELSE 'free'
  END
)
WHERE tool_cost_level IS NULL;
