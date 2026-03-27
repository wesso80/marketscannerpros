-- Discord Bridge: Channel webhook configuration for MSP → Discord data flow
-- Each row maps an MSP data source to a Discord channel webhook.

CREATE TABLE IF NOT EXISTS discord_bridge_channels (
  id SERIAL PRIMARY KEY,
  channel_key VARCHAR(60) NOT NULL UNIQUE,      -- e.g. 'msp-scanner', 'golden-egg', 'msp-alerts'
  label VARCHAR(120) NOT NULL,                   -- Human-friendly label
  category VARCHAR(40) NOT NULL DEFAULT 'core',  -- 'core' | 'engine' | 'signal' | 'education'
  webhook_url TEXT,                               -- Discord webhook URL (null = disabled)
  enabled BOOLEAN NOT NULL DEFAULT false,
  cooldown_minutes INTEGER NOT NULL DEFAULT 15,  -- Min minutes between posts to this channel
  last_posted_at TIMESTAMPTZ,
  post_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the default channel layout (no webhook URLs — admin configures those)
INSERT INTO discord_bridge_channels (channel_key, label, category, cooldown_minutes) VALUES
  ('msp-dashboard',      'MSP Dashboard',          'core',      60),
  ('msp-scanner',        'MSP Scanner',            'core',      30),
  ('golden-egg',         'Golden Egg',             'core',      30),
  ('trade-terminal',     'Trade Terminal',          'core',      60),
  ('market-explorer',    'Market Explorer',         'core',      60),
  ('research',           'Research & Catalysts',    'core',      30),
  ('workspace',          'Workspace',               'core',     120),
  ('volatility-engine',  'Volatility Engine (DVE)', 'engine',    15),
  ('time-confluence',    'Time Confluence',         'engine',    30),
  ('market-pressure',    'Market Pressure (MPE)',   'engine',    15),
  ('confluence-engine',  'Confluence Engine',       'engine',    15),
  ('msp-alerts',         'MSP Alerts',             'signal',    5),
  ('breakout-watch',     'Breakout Watch',          'signal',   10),
  ('trap-detection',     'Trap Detection',          'signal',   10),
  ('ai-analyst',         'AI Analyst',              'education', 30),
  ('trade-reviews',      'Trade Reviews',           'education', 60)
ON CONFLICT (channel_key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_discord_bridge_enabled
  ON discord_bridge_channels (enabled, channel_key)
  WHERE enabled = true;
