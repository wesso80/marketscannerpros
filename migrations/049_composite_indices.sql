-- Migration 049: Composite indices for workspace-scoped queries
-- Improves query performance for multi-tenant table scans
-- All WHERE clauses filter by workspace_id first; these indices match that pattern.

-- Portfolio positions: workspace + symbol (common filter: lookup by symbol)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_portfolio_positions_ws_symbol
  ON portfolio_positions (workspace_id, symbol);

-- Portfolio closed trades: workspace + close_date (for date-range reports)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_portfolio_closed_ws_closed
  ON portfolio_closed (workspace_id, close_date DESC);

-- Journal entries: workspace + date (chronological listing)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_journal_entries_ws_date
  ON journal_entries (workspace_id, trade_date DESC);

-- AI usage: workspace + created_at (daily quota checks and history)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_usage_ws_created
  ON ai_usage (workspace_id, created_at DESC);

-- AI signal log: workspace + symbol + signal_at (dedup + history)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_signal_log_ws_symbol_at
  ON ai_signal_log (workspace_id, symbol, signal_at DESC);

-- User subscriptions: workspace (tier lookups)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_subscriptions_ws
  ON user_subscriptions (workspace_id);
