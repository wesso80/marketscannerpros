-- ============================================================
-- Migration 040: catalyst_event_members
-- Audit trail linking each event to the study(s) it contributed to.
-- Tracks inclusion/exclusion with reason for full reproducibility.
-- ============================================================

CREATE TABLE IF NOT EXISTS catalyst_event_members (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id         UUID         NOT NULL REFERENCES catalyst_event_studies(id) ON DELETE CASCADE,
  event_id         UUID         NOT NULL REFERENCES catalyst_events(id) ON DELETE CASCADE,
  included         BOOLEAN      NOT NULL DEFAULT true,
  exclusion_reason TEXT,                              -- e.g. 'earnings_confound', 'missing_price_data'
  features         JSONB        NOT NULL DEFAULT '{}', -- session, regime, returns snapshot
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Find all members of a study
CREATE INDEX IF NOT EXISTS idx_catalyst_members_study
  ON catalyst_event_members (study_id);

-- Find all studies an event belongs to
CREATE INDEX IF NOT EXISTS idx_catalyst_members_event
  ON catalyst_event_members (event_id);

-- Prevent duplicate membership
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalyst_members_dedup
  ON catalyst_event_members (study_id, event_id);
