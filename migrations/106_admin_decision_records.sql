-- Research notes only; no orders, fills, positions or execution authority.
-- GET endpoints never initialize schema. POST can initialize this table for existing installations.
CREATE TABLE IF NOT EXISTS admin_decision_records (
  id UUID PRIMARY KEY, workspace_id TEXT NOT NULL, request_id UUID NOT NULL,
  symbol TEXT NOT NULL, market TEXT NOT NULL, strategy_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('WATCH','DECLINED','FOLLOW_UP')), note TEXT NOT NULL,
  evidence JSONB NOT NULL, reference_price DOUBLE PRECISION, reference_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(workspace_id, request_id)
);
CREATE INDEX IF NOT EXISTS admin_decisions_workspace_created ON admin_decision_records (workspace_id, created_at DESC);
