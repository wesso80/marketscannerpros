-- Migration 065: Admin morning brief review actions
-- Adds explicit rule-broken labels for end-of-session review.

ALTER TABLE admin_morning_brief_feedback
  DROP CONSTRAINT IF EXISTS admin_morning_brief_feedback_action_check;

ALTER TABLE admin_morning_brief_feedback
  ADD CONSTRAINT admin_morning_brief_feedback_action_check
  CHECK (action IN ('taken', 'ignored', 'missed', 'worked', 'failed', 'invalidated', 'rule_broken'));

CREATE INDEX IF NOT EXISTS idx_admin_mbf_playbook_created
  ON admin_morning_brief_feedback (playbook, created_at DESC);