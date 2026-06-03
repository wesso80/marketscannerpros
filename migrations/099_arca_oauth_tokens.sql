-- OAuth tokens for marketing channel publishing (X, etc.)
-- Auto-created on first use via ensureOauthSchema().

CREATE TABLE IF NOT EXISTS arca_oauth_tokens (
  provider TEXT PRIMARY KEY,                 -- 'x' | 'instagram' | ...
  account_id TEXT,                            -- provider account id
  account_handle TEXT,                        -- e.g. @marketscans1980
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,                     -- when access_token expires
  scope TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS arca_oauth_states (
  state TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arca_oauth_states_created
  ON arca_oauth_states (created_at);
