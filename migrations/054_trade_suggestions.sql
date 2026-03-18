-- Migration 054: Trade Suggestions — v4 Opportunity Suggestion Engine
-- Stores proactive trade opportunities generated from scanner + edge profile matching.
-- Status lifecycle: pending → accepted | rejected | expired

CREATE TABLE IF NOT EXISTS trade_suggestions (
  id              BIGSERIAL       PRIMARY KEY,
  workspace_id    TEXT            NOT NULL,
  symbol          VARCHAR(32)     NOT NULL,
  asset_class     VARCHAR(16),                          -- equity | crypto | forex
  direction       VARCHAR(12)     NOT NULL,             -- bullish | bearish
  strategy        VARCHAR(64),                          -- breakout | momentum | mean_reversion | ...
  setup           VARCHAR(128),                         -- human-readable setup description
  scanner_score   NUMERIC(6,2)    NOT NULL DEFAULT 0,   -- 0-100 from scanner
  edge_match_score NUMERIC(6,4)   NOT NULL DEFAULT 0,   -- 0-1 how well it matches edge profile
  confidence_score NUMERIC(6,4)   NOT NULL DEFAULT 0,   -- 0-1 composite confidence
  suggested_entry NUMERIC(18,8),                        -- suggested entry price
  suggested_stop  NUMERIC(18,8),                        -- suggested stop loss
  suggested_target NUMERIC(18,8),                       -- suggested target price
  position_size   NUMERIC(10,4),                        -- suggested position size (shares/units)
  risk_reward     NUMERIC(6,2),                         -- R:R ratio
  reasoning       TEXT,                                 -- AI-generated explanation
  status          VARCHAR(16)     NOT NULL DEFAULT 'pending',  -- pending | accepted | rejected | expired
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ     NOT NULL,
  acted_at        TIMESTAMPTZ                           -- when user accepted/rejected
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_trade_suggestions_workspace
  ON trade_suggestions (workspace_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trade_suggestions_expiry
  ON trade_suggestions (status, expires_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_trade_suggestions_symbol
  ON trade_suggestions (workspace_id, symbol, created_at DESC);
