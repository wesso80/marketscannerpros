-- migrations/080_admin_market_packets.sql
-- Persistent canonical AdminMarketPacket store.
--
-- Every admin memo / page / report run hydrates from this table and writes
-- back the snapshot it used. Backtests replay against these packets so
-- there is zero look-ahead and zero synthetic recreation.
--
-- ARCA (and any LLM layer) must cite from packet rows — if a claim has no
-- packet_id + field reference, it is rejected as hallucination.

CREATE TABLE IF NOT EXISTS admin_market_packets (
  id               VARCHAR(64)  PRIMARY KEY,        -- ULID-style, generated server-side
  workspace_id     UUID         NOT NULL,
  scope            VARCHAR(48)  NOT NULL,           -- 'symbol' | 'sector' | 'macro' | 'portfolio' | 'multi'
  scope_key        VARCHAR(128) NOT NULL,           -- e.g. 'AAPL' or 'XLK' or 'US_EQUITY'
  packet_type      VARCHAR(48)  NOT NULL,           -- 'equity-research' | 'earnings' | 'options' | 'risk' | 'sector' | 'quant' | 'daily-brief' | 'morning-brief'
  payload          JSONB        NOT NULL,           -- full AdminMarketPacket as built
  sources          JSONB        NOT NULL,           -- [{name, fetchedAt, freshness, missingFields}]
  freshness        VARCHAR(16)  NOT NULL,           -- 'real-time' | 'delayed' | 'stale' | 'unknown'
  confidence       VARCHAR(16)  NOT NULL,           -- 'high' | 'medium' | 'low'
  evidence_quality NUMERIC(5,2),
  stale_after      TIMESTAMPTZ,                     -- after this ts the packet must be re-hydrated
  built_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_packets_ws_built
  ON admin_market_packets (workspace_id, built_at DESC);

CREATE INDEX IF NOT EXISTS idx_market_packets_ws_scope
  ON admin_market_packets (workspace_id, scope, scope_key, built_at DESC);

CREATE INDEX IF NOT EXISTS idx_market_packets_ws_type
  ON admin_market_packets (workspace_id, packet_type, built_at DESC);
