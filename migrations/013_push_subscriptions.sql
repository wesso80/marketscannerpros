-- Push Notification Subscriptions
-- Stores Web Push API subscription data for each user

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Unique constraint per user per endpoint
  UNIQUE(workspace_id, endpoint)
);

-- Index for fast lookups by workspace
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_workspace ON push_subscriptions(workspace_id);

-- Comments
COMMENT ON TABLE push_subscriptions IS 'Web Push API subscriptions for real-time notifications';
COMMENT ON COLUMN push_subscriptions.endpoint IS 'Push service endpoint URL';
COMMENT ON COLUMN push_subscriptions.p256dh_key IS 'Public key for encryption (base64)';
COMMENT ON COLUMN push_subscriptions.auth_key IS 'Auth secret for encryption (base64)';
