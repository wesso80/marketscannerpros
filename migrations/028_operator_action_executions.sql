-- Operator Action Executions Table
-- Tracks AI operator action proposals and their execution status

CREATE TABLE IF NOT EXISTS operator_action_executions (
  id BIGSERIAL PRIMARY KEY,
  workspace_id UUID NOT NULL,
  idempotency_key VARCHAR(160) NOT NULL,
  proposal_id VARCHAR(160),
  action_type VARCHAR(80) NOT NULL,
  source VARCHAR(80),
  mode VARCHAR(16) NOT NULL DEFAULT 'draft',
  status VARCHAR(20) NOT NULL DEFAULT 'processing',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_operator_action_executions_workspace_created
  ON operator_action_executions (workspace_id, created_at DESC);