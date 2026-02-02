-- Migration: Add risk management fields to journal_entries
-- Date: 2026-02-02
-- Purpose: Support R-multiple tracking, stop loss, and target prices

-- Add new columns for risk management
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS stop_loss DECIMAL(20,8);
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS target DECIMAL(20,8);
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS risk_amount DECIMAL(20,8);
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS r_multiple DECIMAL(10,4);
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS planned_rr DECIMAL(10,4);

-- Add comments for clarity
COMMENT ON COLUMN journal_entries.stop_loss IS 'Stop loss price level';
COMMENT ON COLUMN journal_entries.target IS 'Target/take profit price level';
COMMENT ON COLUMN journal_entries.risk_amount IS 'Dollar risk = |entry - stop| * quantity';
COMMENT ON COLUMN journal_entries.r_multiple IS 'R gained/lost = P&L / risk_amount';
COMMENT ON COLUMN journal_entries.planned_rr IS 'Planned risk:reward ratio at entry';

-- Create index for R-multiple analysis queries
CREATE INDEX IF NOT EXISTS idx_journal_r_multiple ON journal_entries(workspace_id, r_multiple) WHERE r_multiple IS NOT NULL;
