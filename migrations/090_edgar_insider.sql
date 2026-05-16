-- 090_edgar_insider.sql
-- SEC EDGAR insider-transaction and 13F holdings tables.
--
-- insider_transactions: rows from Form 4 (Statement of Changes in
--   Beneficial Ownership) — director/officer/10% holder trades.
-- institutional_holdings_13f: rows from Form 13F (quarterly holdings).
--
-- Both tables store ingest_source + ingest_ts so downstream consumers
-- can show provenance and freshness. No silent backfill — missing
-- fields stay NULL.

CREATE TABLE IF NOT EXISTS insider_transactions (
  id BIGSERIAL PRIMARY KEY,
  symbol VARCHAR(16) NOT NULL,
  issuer_cik VARCHAR(12),
  reporter_name TEXT,
  reporter_cik VARCHAR(12),
  reporter_relationship TEXT, -- director|officer|10%|other (free text from filing)
  transaction_date DATE NOT NULL,
  transaction_code VARCHAR(4), -- P (purchase), S (sale), A (award), M (exercise), etc.
  shares NUMERIC(20, 4),
  price_per_share NUMERIC(14, 4),
  total_value NUMERIC(20, 2),
  shares_after NUMERIC(20, 4),
  direct_or_indirect VARCHAR(2), -- D or I
  filing_accession VARCHAR(32) NOT NULL,
  filing_url TEXT,
  filed_at TIMESTAMPTZ,
  ingest_source VARCHAR(32) NOT NULL DEFAULT 'edgar',
  ingest_ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (filing_accession, reporter_cik, transaction_date, transaction_code, COALESCE(shares, 0))
);

CREATE INDEX IF NOT EXISTS insider_tx_symbol_date_idx
  ON insider_transactions (symbol, transaction_date DESC);
CREATE INDEX IF NOT EXISTS insider_tx_code_idx
  ON insider_transactions (transaction_code, transaction_date DESC);

CREATE TABLE IF NOT EXISTS institutional_holdings_13f (
  id BIGSERIAL PRIMARY KEY,
  symbol VARCHAR(16) NOT NULL,
  cusip VARCHAR(12),
  filer_name TEXT NOT NULL,
  filer_cik VARCHAR(12),
  report_period DATE NOT NULL, -- quarter-end date
  shares NUMERIC(20, 0),
  market_value_usd NUMERIC(20, 2),
  pct_portfolio NUMERIC(7, 4),
  put_call CHAR(1), -- 'P' or 'C' or NULL
  investment_discretion VARCHAR(16),
  filing_accession VARCHAR(32) NOT NULL,
  filing_url TEXT,
  filed_at TIMESTAMPTZ,
  ingest_source VARCHAR(32) NOT NULL DEFAULT 'edgar',
  ingest_ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (filing_accession, filer_cik, symbol, COALESCE(put_call, '-'))
);

CREATE INDEX IF NOT EXISTS holdings_13f_symbol_period_idx
  ON institutional_holdings_13f (symbol, report_period DESC);
CREATE INDEX IF NOT EXISTS holdings_13f_filer_period_idx
  ON institutional_holdings_13f (filer_cik, report_period DESC);

-- Symbol → CIK cache so we don't re-fetch the SEC ticker map repeatedly.
CREATE TABLE IF NOT EXISTS edgar_symbol_map (
  symbol VARCHAR(16) PRIMARY KEY,
  cik VARCHAR(12) NOT NULL,
  company_name TEXT,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
