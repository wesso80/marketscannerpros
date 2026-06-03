-- Arca marketing drafts queue
-- Run manually or it will be auto-created by the API on first call.

CREATE TABLE IF NOT EXISTS arca_marketing_drafts (
  id BIGSERIAL PRIMARY KEY,
  channel TEXT NOT NULL,                   -- 'x' | 'instagram' | 'discord' | 'email' | 'blog'
  topic TEXT,                               -- short label, e.g. 'top opportunity AAPL'
  content TEXT NOT NULL,                    -- the post body
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected | published | failed
  source TEXT,                              -- 'cron' | 'arca-tool' | 'manual'
  source_ref TEXT,                          -- optional reference id (signal id, symbol, etc.)
  metadata JSONB,                           -- channel-specific extras (image url, embeds, hashtags)
  scheduled_for TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  publish_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arca_drafts_status_created
  ON arca_marketing_drafts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_arca_drafts_channel
  ON arca_marketing_drafts (channel, status);
