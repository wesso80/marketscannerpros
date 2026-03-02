-- =====================================================
-- 045_equity_universe_full.sql
-- Purpose: Insert ALL 67 EQUITY_UNIVERSE stocks into
--          symbol_universe so the worker pre-fetches them.
--          Without this, ~41 stocks were being fetched
--          on-demand during every scan (hitting AV API).
-- Safe to run multiple times (idempotent via ON CONFLICT)
-- =====================================================

INSERT INTO symbol_universe (symbol, asset_type, name, tier, enabled)
VALUES
  -- =========================================================
  -- Tier 1: Mega-cap tech + top ETFs (30-45s refresh)
  -- These are the most-scanned, most-liquid names
  -- =========================================================
  ('AAPL',  'equity', 'Apple Inc',                  1, TRUE),
  ('MSFT',  'equity', 'Microsoft Corporation',       1, TRUE),
  ('GOOGL', 'equity', 'Alphabet Inc',               1, TRUE),
  ('AMZN',  'equity', 'Amazon.com Inc',             1, TRUE),
  ('NVDA',  'equity', 'NVIDIA Corporation',          1, TRUE),
  ('META',  'equity', 'Meta Platforms Inc',          1, TRUE),
  ('TSLA',  'equity', 'Tesla Inc',                   1, TRUE),
  ('AVGO',  'equity', 'Broadcom Inc',               1, TRUE),
  ('SPY',   'equity', 'SPDR S&P 500 ETF',           1, TRUE),
  ('QQQ',   'equity', 'Invesco QQQ Trust',           1, TRUE),

  -- =========================================================
  -- Tier 2: Large-cap sector leaders (2min refresh)
  -- Finance, Healthcare, Consumer, Industrial, Energy, Semis
  -- =========================================================

  -- Finance
  ('JPM',   'equity', 'JPMorgan Chase & Co',         2, TRUE),
  ('V',     'equity', 'Visa Inc',                    2, TRUE),
  ('MA',    'equity', 'Mastercard Inc',              2, TRUE),
  ('BAC',   'equity', 'Bank of America Corp',        2, TRUE),
  ('WFC',   'equity', 'Wells Fargo & Co',            2, TRUE),
  ('GS',    'equity', 'Goldman Sachs Group',         2, TRUE),
  ('MS',    'equity', 'Morgan Stanley',              2, TRUE),
  ('BLK',   'equity', 'BlackRock Inc',               2, TRUE),

  -- Healthcare
  ('UNH',   'equity', 'UnitedHealth Group',          2, TRUE),
  ('JNJ',   'equity', 'Johnson & Johnson',           2, TRUE),
  ('LLY',   'equity', 'Eli Lilly and Co',            2, TRUE),
  ('PFE',   'equity', 'Pfizer Inc',                  2, TRUE),
  ('ABBV',  'equity', 'AbbVie Inc',                  2, TRUE),
  ('MRK',   'equity', 'Merck & Co Inc',              2, TRUE),

  -- Consumer
  ('WMT',   'equity', 'Walmart Inc',                 2, TRUE),
  ('PG',    'equity', 'Procter & Gamble Co',         2, TRUE),
  ('KO',    'equity', 'Coca-Cola Co',                2, TRUE),
  ('PEP',   'equity', 'PepsiCo Inc',                 2, TRUE),
  ('COST',  'equity', 'Costco Wholesale Corp',       2, TRUE),
  ('MCD',   'equity', 'McDonald''s Corp',            2, TRUE),
  ('NKE',   'equity', 'Nike Inc',                    2, TRUE),
  ('HD',    'equity', 'Home Depot Inc',              2, TRUE),

  -- Industrial
  ('CAT',   'equity', 'Caterpillar Inc',             2, TRUE),
  ('DE',    'equity', 'Deere & Company',             2, TRUE),
  ('UPS',   'equity', 'United Parcel Service',       2, TRUE),
  ('BA',    'equity', 'Boeing Company',              2, TRUE),
  ('HON',   'equity', 'Honeywell International',     2, TRUE),
  ('GE',    'equity', 'GE Aerospace',                2, TRUE),

  -- Energy
  ('XOM',   'equity', 'Exxon Mobil Corp',            2, TRUE),
  ('CVX',   'equity', 'Chevron Corp',                2, TRUE),
  ('COP',   'equity', 'ConocoPhillips',              2, TRUE),
  ('SLB',   'equity', 'Schlumberger Ltd',            2, TRUE),

  -- Semiconductors
  ('AMD',   'equity', 'Advanced Micro Devices',      2, TRUE),
  ('INTC',  'equity', 'Intel Corporation',           2, TRUE),
  ('QCOM',  'equity', 'Qualcomm Inc',               2, TRUE),
  ('MU',    'equity', 'Micron Technology',           2, TRUE),
  ('AMAT',  'equity', 'Applied Materials Inc',       2, TRUE),

  -- Tech mega-cap (remaining)
  ('ORCL',  'equity', 'Oracle Corporation',          2, TRUE),
  ('CRM',   'equity', 'Salesforce Inc',              2, TRUE),
  ('ADBE',  'equity', 'Adobe Inc',                   2, TRUE),
  ('NOW',   'equity', 'ServiceNow Inc',              2, TRUE),
  ('INTU',  'equity', 'Intuit Inc',                  2, TRUE),

  -- =========================================================
  -- Tier 3: Growth / High-beta names (5-10min refresh)
  -- =========================================================
  ('NFLX',  'equity', 'Netflix Inc',                 3, TRUE),
  ('UBER',  'equity', 'Uber Technologies',           3, TRUE),
  ('ABNB',  'equity', 'Airbnb Inc',                  3, TRUE),
  ('SQ',    'equity', 'Block Inc',                   3, TRUE),
  ('SHOP',  'equity', 'Shopify Inc',                 3, TRUE),
  ('SNOW',  'equity', 'Snowflake Inc',               3, TRUE),
  ('PLTR',  'equity', 'Palantir Technologies',       3, TRUE),
  ('CRWD',  'equity', 'CrowdStrike Holdings',        3, TRUE),
  ('DIS',   'equity', 'Walt Disney Co',              3, TRUE),
  ('PYPL',  'equity', 'PayPal Holdings Inc',         3, TRUE),

  -- ETFs (from earlier seed, keep consistent)
  ('IWM',   'equity', 'iShares Russell 2000 ETF',    2, TRUE),
  ('DIA',   'equity', 'SPDR Dow Jones ETF',          2, TRUE),

  -- Previously seeded growth names (keep at tier 2-3)
  ('COIN',  'equity', 'Coinbase Global',             3, TRUE),
  ('SOFI',  'equity', 'SoFi Technologies',           3, TRUE)

ON CONFLICT (symbol)
DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  name       = EXCLUDED.name,
  tier       = EXCLUDED.tier,
  enabled    = TRUE,
  updated_at = NOW();

-- =====================================================
-- Verify: should return 69 enabled equity rows
-- (67 EQUITY_UNIVERSE + SPY + QQQ + IWM + DIA + COIN + SOFI
--  minus overlaps = 69 unique)
-- =====================================================
-- SELECT count(*) FROM symbol_universe
-- WHERE asset_type = 'equity' AND enabled = TRUE;
