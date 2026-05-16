-- 089_personal_universe.sql
-- Personal watch universe + per-workspace kill switch for admin operator.
--
-- personal_universe: explicit list of symbols the operator is actively
--   tracking. Each row carries why it's there (thesis, tags) and a
--   personal max position cap. Pre-trade checklist + alert routing
--   should respect these caps.
--
-- workspace_settings: lightweight key/value config per workspace.
--   Kill switch column disables alert emission and notification sending
--   when true. Stored as boolean for read speed; an audit trail row
--   captures every toggle.
--
-- kill_switch_log: append-only audit trail for kill-switch toggles.

CREATE TABLE IF NOT EXISTS personal_universe (
  id BIGSERIAL PRIMARY KEY,
  workspace_id UUID NOT NULL,
  symbol VARCHAR(16) NOT NULL,
  asset_class VARCHAR(16) NOT NULL DEFAULT 'equity', -- equity|crypto|etf|fx|commodity
  thesis TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  max_position_usd NUMERIC(14, 2),
  max_position_pct_equity NUMERIC(6, 3),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, symbol)
);

CREATE INDEX IF NOT EXISTS personal_universe_workspace_idx
  ON personal_universe (workspace_id, active);
CREATE INDEX IF NOT EXISTS personal_universe_tags_gin
  ON personal_universe USING GIN (tags);

CREATE TABLE IF NOT EXISTS workspace_settings (
  workspace_id UUID PRIMARY KEY,
  kill_switch_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  kill_switch_reason TEXT,
  kill_switch_set_at TIMESTAMPTZ,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kill_switch_log (
  id BIGSERIAL PRIMARY KEY,
  workspace_id UUID NOT NULL,
  enabled BOOLEAN NOT NULL,
  reason TEXT,
  actor VARCHAR(64), -- admin email or 'system'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kill_switch_log_workspace_idx
  ON kill_switch_log (workspace_id, created_at DESC);
