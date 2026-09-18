-- =====================================================
-- 100_symbol_universe_asset_hygiene.sql
-- Purpose: 47 non-equity rows were inserted with asset_type='equity'
--          (legacy crypto pair symbols + futures/index roots). Reclassify
--          them explicitly, disable them (no valid ingest path under their
--          true class), and add a CHECK constraint so it cannot recur.
-- Idempotent. Reversible: rows are kept, only asset_type/enabled change.
-- Verified against production on 2026-09-18 (see test/universeAssetClass.test.ts).
-- =====================================================

BEGIN;

-- 1. Legacy crypto pair symbols stored as equities. The tradeable base coins
--    (ADA, APT, ARB, …) already exist as asset_type='crypto' rows fed by
--    CoinGecko; these pair rows are duplicates and are disabled.
UPDATE symbol_universe
SET asset_type = 'crypto', enabled = FALSE, updated_at = NOW()
WHERE asset_type = 'equity'
  AND symbol IN (
    'ADAUSD', 'AMPUSD', 'APTUSD', 'ARBUSD', 'ARIAUSDT', 'ATOMUSD', 'AXSUSD', 'BARDUSDT',
    'BASEDUSD', 'BCHUSD', 'BLESSUSD', 'BNBUSD', 'CRVUSD', 'DOGEUSD', 'ENJUSD', 'ETHUSD',
    'GALAUSD', 'GTCUSD', 'HBARUSD', 'INJUSD', 'JTOUSD', 'KAITOUSD', 'LINKUSD', 'LTCUSD',
    'METUSD', 'NEARUSD', 'ONDOUSD', 'QNTUSD', 'RAVEUSD', 'ROLLUSD', 'SHIBUSD', 'SOLUSD',
    'SUIUSD', 'SUSHIUSD', 'TONUSD', 'TRXUSD', 'VELVETUSD', 'WETHUSD', 'WLDUSD', 'XCNUSDT',
    'XLMUSD', 'ZECUSD'
  );

-- 2. Futures roots (gold / Nasdaq-100 continuous contracts).
UPDATE symbol_universe
SET asset_type = 'future', enabled = FALSE, updated_at = NOW()
WHERE symbol IN ('GC', 'GC1', 'MGC1', 'NQ1') AND asset_type <> 'future';

-- 3. Cash index.
UPDATE symbol_universe
SET asset_type = 'index', enabled = FALSE, updated_at = NOW()
WHERE symbol = 'SPX' AND asset_type <> 'index';

-- 4. Constrain the column. 'forex' is kept as the canonical FX value because
--    worker/ and app/api/ already filter on it; 'etf' is allowed but existing
--    ETF rows are intentionally left as 'equity' (CRCS and bulk-scan filter on
--    asset_type IN ('equity','crypto') and must not lose ETFs).
ALTER TABLE symbol_universe DROP CONSTRAINT IF EXISTS symbol_universe_asset_type_check;
ALTER TABLE symbol_universe
  ADD CONSTRAINT symbol_universe_asset_type_check
  CHECK (asset_type IN ('equity', 'etf', 'crypto', 'forex', 'commodity', 'index', 'future'));

COMMIT;
