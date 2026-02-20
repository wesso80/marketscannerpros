CREATE TABLE IF NOT EXISTS journal_trade_snapshots (
  id BIGSERIAL PRIMARY KEY,
  workspace_id VARCHAR(100) NOT NULL,
  journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('scanner', 'options', 'time')),
  phase TEXT NOT NULL CHECK (phase IN ('entry', 'mid', 'exit')),
  symbol TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  score NUMERIC,
  confidence NUMERIC,
  permission TEXT,
  grade NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_trade_snapshots_workspace_trade_time
  ON journal_trade_snapshots (workspace_id, journal_entry_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_journal_trade_snapshots_workspace_source_phase
  ON journal_trade_snapshots (workspace_id, source, phase, created_at DESC);
