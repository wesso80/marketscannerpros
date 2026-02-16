-- =====================================================
-- 020_workflow_operator_loop.sql
-- Purpose: Support operator workflow lifecycle automation and dashboard summary
-- Safe to run multiple times (idempotent)
-- =====================================================

-- 1) AI events: speed up workflow summary queries
CREATE INDEX IF NOT EXISTS idx_ai_events_workspace_type_created
  ON ai_events (workspace_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_events_workflow_today
  ON ai_events (workspace_id, created_at DESC)
  WHERE event_type IN (
    'signal.created',
    'candidate.created',
    'trade.plan.created',
    'trade.executed',
    'trade.closed',
    'coach.analysis.generated',
    'strategy.rule.suggested',
    'strategy.rule.applied'
  );

CREATE INDEX IF NOT EXISTS idx_ai_events_coach_parent_event
  ON ai_events (
    workspace_id,
    event_type,
    (event_data->'correlation'->>'parent_event_id')
  )
  WHERE event_type = 'coach.analysis.generated';

CREATE INDEX IF NOT EXISTS idx_ai_events_strategy_parent_event
  ON ai_events (
    workspace_id,
    event_type,
    (event_data->'correlation'->>'parent_event_id')
  )
  WHERE event_type = 'strategy.rule.suggested';

CREATE INDEX IF NOT EXISTS idx_ai_events_strategy_applied_task
  ON ai_events (
    workspace_id,
    event_type,
    (event_data->'payload'->>'task_id')
  )
  WHERE event_type = 'strategy.rule.applied';

CREATE INDEX IF NOT EXISTS idx_ai_events_workflow_corr
  ON ai_events (
    workspace_id,
    event_type,
    (event_data->'correlation'->>'workflow_id'),
    created_at DESC
  )
  WHERE event_type IN ('candidate.created', 'trade.plan.created', 'trade.executed', 'trade.closed');

-- 2) Alerts: speed up workflow auto-alert dedupe + daily summary
CREATE INDEX IF NOT EXISTS idx_alerts_workflow_plan_dedupe
  ON alerts (
    workspace_id,
    (smart_alert_context->>'workflowId'),
    (smart_alert_context->>'planId')
  )
  WHERE is_active = true
    AND is_smart_alert = true;

CREATE INDEX IF NOT EXISTS idx_alerts_workflow_auto_today
  ON alerts (workspace_id, created_at DESC)
  WHERE is_smart_alert = true
    AND (smart_alert_context->>'source') = 'workflow.auto';

-- 3) Journal entries: ensure columns used by workflow auto-drafts exist
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS stop_loss DECIMAL(20,8);
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS target DECIMAL(20,8);
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS risk_amount DECIMAL(20,8);
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS r_multiple DECIMAL(10,4);
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS planned_rr DECIMAL(10,4);

-- 4) Journal entries: speed up auto-draft dedupe + daily summary
CREATE INDEX IF NOT EXISTS idx_journal_entries_workspace_symbol_open
  ON journal_entries (workspace_id, symbol, is_open, outcome);

CREATE INDEX IF NOT EXISTS idx_journal_entries_created_at
  ON journal_entries (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_journal_entries_updated_at
  ON journal_entries (workspace_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_journal_entries_tags_gin
  ON journal_entries USING GIN (tags);
