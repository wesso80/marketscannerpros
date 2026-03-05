-- =====================================================
-- 047_crypto_top100_trim.sql
-- Purpose: Trim crypto universe to top 100 by market cap
--          Remove low-volume junk coins, no stablecoins
--          Re-tier: T1=20, T2=30, T3=50
-- Safe to run multiple times (idempotent)
-- Date: 2026-03-05
-- =====================================================

-- Step 1: Disable ALL crypto coins first
UPDATE symbol_universe
SET enabled = FALSE, updated_at = NOW()
WHERE asset_type = 'crypto';

-- Step 2: Enable + assign Tier 1 (top 20 by market cap)
UPDATE symbol_universe
SET tier = 1, enabled = TRUE, updated_at = NOW()
WHERE asset_type = 'crypto'
  AND symbol IN (
    'BTC',   -- Bitcoin
    'ETH',   -- Ethereum
    'XRP',   -- Ripple
    'BNB',   -- Binance Coin
    'SOL',   -- Solana
    'DOGE',  -- Dogecoin
    'ADA',   -- Cardano
    'TRX',   -- Tron
    'LINK',  -- Chainlink
    'AVAX',  -- Avalanche
    'TON',   -- Toncoin
    'SHIB',  -- Shiba Inu
    'SUI',   -- Sui
    'DOT',   -- Polkadot
    'HBAR',  -- Hedera
    'BCH',   -- Bitcoin Cash
    'LTC',   -- Litecoin
    'XLM',   -- Stellar
    'APT',   -- Aptos
    'NEAR'   -- Near Protocol
  );

-- Step 3: Enable + assign Tier 2 (21-50 by market cap)
UPDATE symbol_universe
SET tier = 2, enabled = TRUE, updated_at = NOW()
WHERE asset_type = 'crypto'
  AND symbol IN (
    'UNI',    -- Uniswap
    'ETC',    -- Ethereum Classic
    'ATOM',   -- Cosmos
    'RENDER', -- Render
    'FET',    -- Fetch.ai
    'TAO',    -- Bittensor
    'INJ',    -- Injective
    'ICP',    -- Internet Computer
    'FIL',    -- Filecoin
    'ARB',    -- Arbitrum
    'OP',     -- Optimism
    'VET',    -- VeChain
    'KAS',    -- Kaspa
    'STX',    -- Stacks
    'AAVE',   -- Aave
    'MKR',    -- Maker
    'IMX',    -- Immutable
    'SEI',    -- Sei
    'GRT',    -- The Graph
    'THETA',  -- Theta Network
    'ALGO',   -- Algorand
    'XMR',    -- Monero
    'JUP',    -- Jupiter
    'CRO',    -- Cronos
    'TIA',    -- Celestia
    'PEPE',   -- Pepe
    'BONK',   -- Bonk
    'WIF',    -- dogwifhat
    'ENA',    -- Ethena
    'MNT'     -- Mantle
  );

-- Step 4: Enable + assign Tier 3 (51-100 by market cap)
UPDATE symbol_universe
SET tier = 3, enabled = TRUE, updated_at = NOW()
WHERE asset_type = 'crypto'
  AND symbol IN (
    'MATIC',  -- Polygon
    'PYTH',   -- Pyth Network
    'PENDLE', -- Pendle
    'RUNE',   -- THORChain
    'EGLD',   -- MultiversX
    'FTM',    -- Fantom/Sonic
    'LDO',    -- Lido DAO
    'CHZ',    -- Chiliz
    'AR',     -- Arweave
    'WLD',    -- Worldcoin
    'GALA',   -- Gala
    'STRK',   -- Starknet
    'ZK',     -- zkSync
    'JTO',    -- Jito
    'ZRO',    -- LayerZero
    'OM',     -- MANTRA
    'CAKE',   -- PancakeSwap
    'XTZ',    -- Tezos
    'GNO',    -- Gnosis
    'ORDI',   -- ORDI
    'BLUR',   -- Blur
    'MINA',   -- Mina
    'HNT',    -- Helium
    'IO',     -- io.net
    'BRETT',  -- Brett
    'POPCAT', -- Popcat
    'KSM',    -- Kusama
    'CFX',    -- Conflux
    'XDC',    -- XDC Network
    'IOTA',   -- IOTA
    'JASMY',  -- JasmyCoin
    'SAND',   -- The Sandbox
    'MANA',   -- Decentraland
    'AXS',    -- Axie Infinity
    'COMP',   -- Compound
    'SNX',    -- Synthetix
    'CRV',    -- Curve DAO Token
    'DYDX',   -- dYdX
    'BAT',    -- Basic Attention Token
    'ENJ',    -- Enjin Coin
    'ZRX',    -- 0x
    'NEXO',   -- Nexo
    'CELO',   -- Celo
    'YFI',    -- yearn.finance
    'ROSE',   -- Oasis
    'FLOW',   -- Flow
    'ANKR',   -- Ankr
    'NEO',    -- Neo
    'KAVA',   -- Kava
    'GMX'     -- GMX
  );

-- Verify counts
-- SELECT tier, enabled, count(*) FROM symbol_universe WHERE asset_type = 'crypto' GROUP BY tier, enabled ORDER BY tier, enabled;
-- Expected: T1=20 enabled, T2=30 enabled, T3=50 enabled, 70 disabled
