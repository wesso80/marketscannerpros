-- Status text for an alert whose price could not be read.
-- Does not change the alert's symbol, condition, or notify settings.
-- Not applied by the app. Until this is applied, the alert list reads the
-- same sentence from the price-notice cache.

ALTER TABLE alerts ADD COLUMN IF NOT EXISTS last_error TEXT;
