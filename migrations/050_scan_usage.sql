-- Daily scan usage tracking for tier-based limits
-- Free: 5/day, Anonymous: 3/day, Pro/Pro Trader: unlimited
CREATE TABLE IF NOT EXISTS scan_usage (
  id SERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  scan_date DATE NOT NULL DEFAULT CURRENT_DATE,
  scan_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(workspace_id, scan_date)
);

CREATE INDEX IF NOT EXISTS idx_scan_usage_ws_date ON scan_usage(workspace_id, scan_date);
