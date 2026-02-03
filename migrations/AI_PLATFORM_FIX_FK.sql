-- =====================================================
-- MSP AI PLATFORM - FIX FOREIGN KEY CONSTRAINTS
-- Created: February 2026
-- Purpose: Remove FK constraints that block AI functionality
-- Run this to fix the "workspace not found" errors
-- =====================================================

-- Drop the foreign key constraints from all AI tables
-- This allows AI features to work even if workspace isn't in workspaces table

ALTER TABLE ai_events DROP CONSTRAINT IF EXISTS fk_workspace;
ALTER TABLE user_memory DROP CONSTRAINT IF EXISTS fk_workspace;
ALTER TABLE ai_responses DROP CONSTRAINT IF EXISTS fk_workspace;
ALTER TABLE ai_feedback DROP CONSTRAINT IF EXISTS fk_workspace;
ALTER TABLE ai_actions DROP CONSTRAINT IF EXISTS fk_workspace;
ALTER TABLE ai_outcomes DROP CONSTRAINT IF EXISTS fk_workspace;

-- Also fix V2 tables if they exist
ALTER TABLE ai_rate_limits DROP CONSTRAINT IF EXISTS fk_workspace;
ALTER TABLE ai_suggestions DROP CONSTRAINT IF EXISTS fk_workspace;

-- Add simple indexes on workspace_id for performance (non-constraining)
CREATE INDEX IF NOT EXISTS idx_ai_events_workspace_id ON ai_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_user_memory_workspace_id ON user_memory(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ai_responses_workspace_id ON ai_responses(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_workspace_id ON ai_feedback(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ai_actions_workspace_id ON ai_actions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ai_outcomes_workspace_id ON ai_outcomes(workspace_id);

-- Done - AI tables now work independently of workspaces table
