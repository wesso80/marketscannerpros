-- Add leverage and premium columns to journal_entries
-- for Futures/Margin and Options trade types
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS leverage DECIMAL(10,2);
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS premium DECIMAL(18,8);
