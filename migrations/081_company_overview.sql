-- migrations/081_company_overview.sql
-- Persistent cache of Alpha Vantage OVERVIEW responses.
-- Eliminates redundant OVERVIEW calls across equity-research, earnings,
-- options, risk and quant memos. Refresh policy: 24h.

CREATE TABLE IF NOT EXISTS company_overview (
  symbol            VARCHAR(20) PRIMARY KEY,
  name              TEXT,
  sector            TEXT,
  industry          TEXT,
  country           TEXT,
  exchange          TEXT,
  currency          TEXT,
  description       TEXT,
  market_cap        NUMERIC(20,2),
  pe_ratio          NUMERIC(12,4),
  peg_ratio         NUMERIC(12,4),
  book_value        NUMERIC(18,8),
  dividend_yield    NUMERIC(10,6),
  eps               NUMERIC(12,4),
  revenue_ttm       NUMERIC(20,2),
  profit_margin     NUMERIC(10,6),
  beta              NUMERIC(10,4),
  high_52w          NUMERIC(18,8),
  low_52w           NUMERIC(18,8),
  shares_outstanding BIGINT,
  payload           JSONB NOT NULL,            -- raw AV OVERVIEW response
  fetched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_overview_sector ON company_overview(sector);
CREATE INDEX IF NOT EXISTS idx_company_overview_fetched ON company_overview(fetched_at);
