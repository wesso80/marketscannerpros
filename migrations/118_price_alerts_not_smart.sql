-- Focus Alert and MSP Auto Plan used to insert price_above / price_below rows
-- with is_smart_alert = true. The basic checker skips smart rows, and the smart
-- checker has no price case, so those alerts stayed Armed and never fired.
--
-- This flips those price rows to basic alerts so /api/alerts/check can arm and
-- evaluate them. Other smart conditions (OI, funding, strategy, scanner) stay smart.
--
-- Safe to re-run: the WHERE clause only matches rows that are still true.
-- Run this by hand in Neon right after the deploy that ships the creator change.

UPDATE alerts
SET is_smart_alert = false
WHERE is_smart_alert IS TRUE
  AND condition_type IN ('price_above', 'price_below');
