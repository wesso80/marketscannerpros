-- =====================================================
-- 027_trim_crypto_top100.sql
-- Purpose: Trim crypto universe to top 100 by market cap
--          Remove low-volume junk coins, no stablecoins
--          Re-tier remaining coins: T1=20, T2=30, T3=50
-- Safe to run multiple times (idempotent)
-- =====================================================

-- Step 1: Disable the 70 coins being dropped
-- (2 from Tier 2: ZEC, DASH + 68 from Tier 3)
UPDATE symbol_universe
SET enabled = FALSE, updated_at = NOW()
WHERE asset_type = 'crypto'
  AND symbol IN (
    -- Former Tier 2 drops (fallen out of top 100)
    'ZEC', 'DASH',
    -- Former Tier 3 drops (low-cap junk)
    'ZIL', 'QTUM', 'ONT', 'ONE', 'SKL', 'HOT', 'KNC',
    'SUSHI', 'BAL', 'BAND', 'API3', 'UMA', 'STORJ', 'OCEAN',
    'LRC', 'ILV', 'CELR', 'CTSI', 'AUDIO', 'MASK', 'RLC',
    'ASTR', 'GLM', 'DENT', 'ICX', 'SC', 'WAVES', 'FLR',
    'SATS', 'SXP', 'RSR', 'CKB', 'ACH', 'TRB', 'NMR',
    'SFP', 'COTI', 'TURBO', 'MEME', 'MEW', 'BTT', 'XYO',
    'LSK', 'ZEN', 'RVN', 'DGB', 'SYS', 'PHA', 'CHR',
    'HOOK', 'MAGIC', 'ARPA', 'SUPER', 'RARE', 'SSV', 'TWT',
    'OGN', 'ALICE', 'SNT', 'STG', 'AMP', 'FXS', 'SLP',
    'C98', 'BICO', 'REQ', 'SPELL', 'NKN',
    -- Stray coin not in top 100
    'VANRY'
  );

-- Step 2: Re-tier remaining 100 coins by market cap rank

-- Tier 1 (20 coins) - Top mega-caps, refreshed every 10min
UPDATE symbol_universe
SET tier = 1, updated_at = NOW()
WHERE asset_type = 'crypto'
  AND enabled = TRUE
  AND symbol IN (
    'BTC', 'ETH', 'XRP', 'BNB', 'SOL',
    'DOGE', 'ADA', 'TRX', 'LINK', 'AVAX',
    'TON', 'SHIB', 'SUI', 'DOT', 'HBAR',
    'BCH', 'LTC', 'XLM', 'APT', 'NEAR'
  );

-- Tier 2 (30 coins) - Large-caps, refreshed every 15min
UPDATE symbol_universe
SET tier = 2, updated_at = NOW()
WHERE asset_type = 'crypto'
  AND enabled = TRUE
  AND symbol IN (
    'UNI', 'ETC', 'ATOM', 'RENDER', 'FET',
    'TAO', 'INJ', 'ICP', 'FIL', 'ARB',
    'OP', 'VET', 'KAS', 'STX', 'AAVE',
    'MKR', 'IMX', 'SEI', 'GRT', 'THETA',
    'ALGO', 'XMR', 'JUP', 'CRO', 'TIA',
    'PEPE', 'BONK', 'WIF', 'ENA', 'MNT'
  );

-- Tier 3 (50 coins) - Mid-caps, refreshed every 60min
UPDATE symbol_universe
SET tier = 3, updated_at = NOW()
WHERE asset_type = 'crypto'
  AND enabled = TRUE
  AND symbol IN (
    'MATIC', 'PYTH', 'PENDLE', 'RUNE', 'EGLD',
    'FTM', 'LDO', 'CHZ', 'AR', 'WLD',
    'GALA', 'STRK', 'ZK', 'JTO', 'ZRO',
    'OM', 'CAKE', 'XTZ', 'GNO', 'ORDI',
    'BLUR', 'MINA', 'HNT', 'IO', 'BRETT',
    'POPCAT', 'KSM', 'CFX', 'XDC', 'IOTA',
    'JASMY', 'SAND', 'MANA', 'AXS', 'COMP',
    'SNX', 'CRV', 'DYDX', 'BAT', 'ENJ',
    'ZRX', 'NEXO', 'CELO', 'YFI', 'ROSE',
    'FLOW', 'ANKR', 'NEO', 'KAVA', 'GMX'
  );
