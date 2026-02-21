-- Migration: Immutable risk-at-entry metrics for journal analytics integrity
-- Date: 2026-02-21

ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS normalized_r DECIMAL(12,6);
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS dynamic_r DECIMAL(12,6);
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS risk_per_trade_at_entry DECIMAL(10,6);
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS equity_at_entry DECIMAL(20,8);

COMMENT ON COLUMN journal_entries.normalized_r IS 'Closed-trade R using fixed normalized risk model (1% risk baseline) at entry-time equity';
COMMENT ON COLUMN journal_entries.dynamic_r IS 'Closed-trade R using live risk_per_trade_at_entry and entry-time equity';
COMMENT ON COLUMN journal_entries.risk_per_trade_at_entry IS 'Immutable dynamic risk fraction applied at trade entry (e.g., 0.005)';
COMMENT ON COLUMN journal_entries.equity_at_entry IS 'Immutable account equity snapshot captured at trade entry';

CREATE INDEX IF NOT EXISTS idx_journal_entries_workspace_trade_date_risk
  ON journal_entries (workspace_id, trade_date DESC)
  INCLUDE (normalized_r, dynamic_r, risk_per_trade_at_entry, equity_at_entry);
