-- Migration 066: Admin morning brief action memory
-- Stores generated trade plans and broker/fill reconciliation snapshots from the private morning cockpit.

CREATE TABLE IF NOT EXISTS admin_morning_trade_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id TEXT NOT NULL UNIQUE,
  brief_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  market TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  bias TEXT NOT NULL,
  permission TEXT NOT NULL,
  confidence NUMERIC(6,2),
  playbook TEXT,
  plan JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_morning_trade_plans_brief
  ON admin_morning_trade_plans (brief_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_morning_trade_plans_symbol
  ON admin_morning_trade_plans (symbol, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_broker_fill_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID,
  source TEXT NOT NULL,
  broker_linked BOOLEAN NOT NULL DEFAULT FALSE,
  broker_tagged_trades INTEGER NOT NULL DEFAULT 0,
  open_broker_tagged_trades INTEGER NOT NULL DEFAULT 0,
  portfolio_positions INTEGER NOT NULL DEFAULT 0,
  unmatched_open_trades INTEGER NOT NULL DEFAULT 0,
  total_broker_tagged_pl NUMERIC(18,2) NOT NULL DEFAULT 0,
  report JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_broker_fill_sync_workspace_created
  ON admin_broker_fill_sync_runs (workspace_id, created_at DESC);
