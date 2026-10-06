-- Focus Alert and MSP Auto Plan used to insert price_above / price_below rows
-- with is_smart_alert = true. The basic checker skips smart rows, and the smart
-- checker has no price case, so those alerts stayed Armed and never fired.
--
-- Statement 1 flips price rows that have a real level (condition_value > 0) to
-- basic alerts so /api/alerts/check can arm and evaluate them.
-- Rows with condition_value = 0 are left smart. Those workflow.auto orphans stay
-- inside the alerts-page orphan count (is_smart_alert and condition_value = 0)
-- and the bulk orphan cleanup at /api/alerts?bulk=auto-orphaned
-- (is_smart_alert = true AND condition_value = 0 AND source workflow.auto).
--
-- Statement 2 sets asset_type = 'crypto' on old focus.creator price rows whose
-- symbol is crypto. The bases are the KNOWN_CRYPTO_BASES list in
-- lib/detectAssetClass.ts. A symbol ending in USDT (with a base) is crypto.
-- A symbol ending in USD, USDC, BUSD, BTC, or ETH is crypto only when the base
-- is in that list. Bare tickers in the list are crypto. Separators - and /
-- are ignored, same as detectAssetClass. The helper's "any symbol ending in
-- USD with length <= 10" fallback is not used, so EURUSD, GBPUSD, and AUDUSD
-- stay unchanged. Rows already marked crypto are skipped.
--
-- Plan direction is not on the alert. smart_alert_context for workflow.auto
-- stores source, workflowId, planId, and related ids only — not side, direction,
-- or bias — and the name and notes do not either. This file does not guess
-- price_below from another table.
--
-- Safe to re-run: each UPDATE only matches rows that still need the change.
-- No deletes. Only alerts is written.
-- Run this by hand in Neon right after the deploy that ships the creator change.

UPDATE alerts
SET is_smart_alert = false
WHERE is_smart_alert IS TRUE
  AND condition_value > 0
  AND condition_type IN ('price_above', 'price_below');

UPDATE alerts
SET asset_type = 'crypto'
WHERE smart_alert_context->>'source' = 'focus.creator'
  AND condition_type IN ('price_above', 'price_below')
  AND asset_type IS DISTINCT FROM 'crypto'
  AND (
    upper(regexp_replace(btrim(symbol), '[-/]', '', 'g')) ~ '^.+USDT$'
    OR upper(regexp_replace(btrim(symbol), '[-/]', '', 'g')) ~ '^(BTC|ETH|SOL|XRP|ADA|DOGE|DOT|AVAX|MATIC|POL|LINK|UNI|SHIB|ATOM|LTC|BCH|APT|SUI|TON|TRX|NEAR|FIL|AAVE|ARB|OP|INJ|TIA|SEI|HBAR|XLM|FET|RENDER|RNDR|ICP|IMX|GRT|PEPE|WIF|BONK|FLOKI|BNB|CRO|MKR|RUNE|SNX|COMP|ALGO|EOS|XTZ|THETA|XMR|NEO|SUSHI|YFI|CRV|BAL|REN|1INCH|ENJ|MANA|SAND|AXS|CHZ|FTM|EGLD|FLOW|AR|HNT|STX|KSM|ZEC|DASH|WAVES|KAVA|CELO|JUP|KAS|XCN|PYTH|PENDLE|BLUR|APE|VET)(USD|USDC|BUSD|BTC|ETH)$'
    OR upper(btrim(symbol)) IN ('BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT', 'AVAX', 'MATIC', 'POL', 'LINK', 'UNI', 'SHIB', 'ATOM', 'LTC', 'BCH', 'APT', 'SUI', 'TON', 'TRX', 'NEAR', 'FIL', 'AAVE', 'ARB', 'OP', 'INJ', 'TIA', 'SEI', 'HBAR', 'XLM', 'FET', 'RENDER', 'RNDR', 'ICP', 'IMX', 'GRT', 'PEPE', 'WIF', 'BONK', 'FLOKI', 'BNB', 'CRO', 'MKR', 'RUNE', 'SNX', 'COMP', 'ALGO', 'EOS', 'XTZ', 'THETA', 'XMR', 'NEO', 'SUSHI', 'YFI', 'CRV', 'BAL', 'REN', '1INCH', 'ENJ', 'MANA', 'SAND', 'AXS', 'CHZ', 'FTM', 'EGLD', 'FLOW', 'AR', 'HNT', 'STX', 'KSM', 'ZEC', 'DASH', 'WAVES', 'KAVA', 'CELO', 'JUP', 'KAS', 'XCN', 'PYTH', 'PENDLE', 'BLUR', 'APE', 'VET')
  );
