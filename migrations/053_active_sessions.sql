-- Migration 053: Active sessions for live users tracking
-- Tracks who is currently using the platform for admin analytics

CREATE TABLE IF NOT EXISTS active_sessions (
  session_id   TEXT PRIMARY KEY,
  user_id      UUID NULL,
  workspace_id UUID NULL,
  last_seen    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_path TEXT,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookups for "who's online" (last_seen within 5 min)
CREATE INDEX IF NOT EXISTS idx_active_sessions_last_seen
  ON active_sessions (last_seen DESC);

-- Lookup by logged-in user
CREATE INDEX IF NOT EXISTS idx_active_sessions_user_id
  ON active_sessions (user_id)
  WHERE user_id IS NOT NULL;

-- Lookup by workspace
CREATE INDEX IF NOT EXISTS idx_active_sessions_workspace_id
  ON active_sessions (workspace_id)
  WHERE workspace_id IS NOT NULL;

-- Partial index for fast "online now" count (sessions active in last 10 min window)
CREATE INDEX IF NOT EXISTS idx_active_sessions_online
  ON active_sessions (last_seen DESC)
  WHERE last_seen > NOW() - INTERVAL '10 minutes';

-- Cleanup helper: delete sessions older than 7 days
-- Run periodically: SELECT cleanup_stale_sessions();
CREATE OR REPLACE FUNCTION cleanup_stale_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM active_sessions
  WHERE last_seen < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
