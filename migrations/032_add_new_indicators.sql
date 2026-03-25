-- Add 5 new locally-computed indicator columns to indicators_latest
-- WILLR: Williams %R (-100 to 0), NATR: Normalized ATR (%), 
-- AD: Chaikin A/D Line (BIGINT), ROC: Rate of Change (%), BOP: Balance of Power (-1 to 1)

ALTER TABLE indicators_latest ADD COLUMN IF NOT EXISTS willr14 NUMERIC;
ALTER TABLE indicators_latest ADD COLUMN IF NOT EXISTS natr14 NUMERIC;
ALTER TABLE indicators_latest ADD COLUMN IF NOT EXISTS ad_line BIGINT;
ALTER TABLE indicators_latest ADD COLUMN IF NOT EXISTS roc12 NUMERIC;
ALTER TABLE indicators_latest ADD COLUMN IF NOT EXISTS bop NUMERIC;
