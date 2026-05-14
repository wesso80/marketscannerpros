-- 076_growth_command_centre.sql
-- Growth Command Centre — admin-only Claude-powered social content pipeline.
-- Reads only allowlisted MSP context (feature descriptions, approved
-- disclaimers, pricing copy, educational summaries). Generated drafts are
-- gated by a compliance checker before they can be published to X / Instagram.
--
-- Hard rules enforced at schema level:
--   * workspace_id on every row (multi-tenant — even though admin-only today,
--     keep it consistent with the rest of the codebase).
--   * compliance_score is mandatory and bounded 0..100.
--   * Publish-only-if-approved is enforced in the publish API route, but we
--     additionally CHECK that posted_at can only be set when status='posted'.
--   * Banned-phrase audit log is preserved per-post so we can prove what was
--     flagged at generation time (legal trail).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Campaigns — a brief that one or more posts hang off
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_campaigns (
  id              BIGSERIAL PRIMARY KEY,
  workspace_id    VARCHAR(100) NOT NULL,

  name            VARCHAR(160) NOT NULL,
  goal            TEXT         NOT NULL,             -- e.g. "get beta/trial users"
  offer           TEXT,                              -- e.g. "full pro access trial"
  audience        TEXT         NOT NULL,             -- target persona description
  tone            VARCHAR(60)  NOT NULL DEFAULT 'founder_led',
  platforms       TEXT[]       NOT NULL DEFAULT ARRAY['x','instagram']::TEXT[],

  status          VARCHAR(20)  NOT NULL DEFAULT 'active',   -- active | paused | archived

  created_by      VARCHAR(120) NOT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT social_campaigns_status_chk
    CHECK (status IN ('active','paused','archived'))
);

CREATE INDEX IF NOT EXISTS social_campaigns_ws_idx
  ON social_campaigns (workspace_id, created_at DESC);

COMMENT ON TABLE social_campaigns IS
  'Growth Command Centre — campaign briefs. Posts FK to campaign_id.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Posts — one generated draft per row, lifecycle: draft -> review -> approved
--                                                  -> posted | rejected
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_posts (
  id                  BIGSERIAL PRIMARY KEY,
  workspace_id        VARCHAR(100) NOT NULL,
  campaign_id         BIGINT REFERENCES social_campaigns(id) ON DELETE SET NULL,

  -- Platform
  platform            VARCHAR(20)  NOT NULL,         -- x | instagram
  post_type           VARCHAR(40)  NOT NULL,         -- x_post | ig_caption | reel_script | carousel | launch_announcement | feature_explainer | trader_education | platform_update | founder_post | conversion | referral

  -- Content
  hook                TEXT,
  caption             TEXT         NOT NULL,
  hashtags            TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  visual_suggestion   TEXT,
  cta                 TEXT,
  disclaimer          TEXT         NOT NULL,
  media_url           TEXT,                          -- approved media (admin uploads only)
  carousel_slides     JSONB,                         -- array of {title, body, visual} when post_type='carousel'

  -- Lifecycle
  status              VARCHAR(20)  NOT NULL DEFAULT 'draft',  -- draft | review | approved | posted | rejected
  scheduled_for       TIMESTAMPTZ,
  posted_at           TIMESTAMPTZ,

  -- Compliance
  compliance_score    INTEGER      NOT NULL DEFAULT 0,
  compliance_notes    JSONB        NOT NULL DEFAULT '[]'::jsonb,  -- [{category, phrase, severity, suggestion}]
  risk_flags          TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],

  -- Provenance (matches rest of codebase — see brain_events)
  source              VARCHAR(60)  NOT NULL DEFAULT 'claude_growth_agent',
  model_version       VARCHAR(60)  NOT NULL DEFAULT 'unversioned',
  prompt_version      VARCHAR(40)  NOT NULL DEFAULT 'v1',
  generation_brief    JSONB,                         -- the campaign brief Claude received

  -- Audit
  created_by          VARCHAR(120) NOT NULL,
  approved_by         VARCHAR(120),
  approved_at         TIMESTAMPTZ,
  rejected_reason     TEXT,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- External IDs (set after successful publish)
  external_id         VARCHAR(120),                  -- X tweet id / IG media id
  external_url        TEXT,

  CONSTRAINT social_posts_platform_chk
    CHECK (platform IN ('x','instagram')),
  CONSTRAINT social_posts_status_chk
    CHECK (status IN ('draft','review','approved','posted','rejected')),
  CONSTRAINT social_posts_score_chk
    CHECK (compliance_score >= 0 AND compliance_score <= 100),
  -- posted_at may only be set if status='posted'; rejected_reason only if status='rejected'
  CONSTRAINT social_posts_posted_state_chk
    CHECK ((posted_at IS NULL) OR status = 'posted'),
  CONSTRAINT social_posts_approved_state_chk
    CHECK (
      (approved_at IS NULL AND approved_by IS NULL)
      OR status IN ('approved','posted')
    ),
  CONSTRAINT social_posts_approval_min_score_chk
    CHECK (
      status NOT IN ('approved','posted')
      OR compliance_score >= 85
    ),
  CONSTRAINT social_posts_posted_requires_approval_chk
    CHECK (
      status <> 'posted'
      OR (
        posted_at IS NOT NULL
        AND approved_at IS NOT NULL
        AND approved_by IS NOT NULL
        AND compliance_score >= 85
      )
    ),
  CONSTRAINT social_posts_rejected_state_chk
    CHECK ((rejected_reason IS NULL) OR status = 'rejected')
);

CREATE INDEX IF NOT EXISTS social_posts_ws_status_idx
  ON social_posts (workspace_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS social_posts_campaign_idx
  ON social_posts (campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS social_posts_scheduled_idx
  ON social_posts (scheduled_for) WHERE scheduled_for IS NOT NULL AND status = 'approved';
CREATE INDEX IF NOT EXISTS social_posts_platform_idx
  ON social_posts (platform, status);
CREATE INDEX IF NOT EXISTS social_posts_ws_updated_idx
  ON social_posts (workspace_id, updated_at DESC);

COMMENT ON TABLE social_posts IS
  'Growth Command Centre — generated social posts. status flow: draft->review->approved->posted|rejected. compliance_score >= 85 required to publish.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Compliance check audit log — append-only history of every check we ran on a
-- post (so we can prove what we flagged when, even after content was edited)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_compliance_checks (
  id              BIGSERIAL PRIMARY KEY,
  post_id         BIGINT       NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  workspace_id    VARCHAR(100) NOT NULL,

  score           INTEGER      NOT NULL,
  passed          BOOLEAN      NOT NULL,
  notes           JSONB        NOT NULL DEFAULT '[]'::jsonb,
  risk_flags      TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  checker_version VARCHAR(20)  NOT NULL DEFAULT 'v1',

  checked_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT social_compliance_score_chk
    CHECK (score >= 0 AND score <= 100)
);

CREATE INDEX IF NOT EXISTS social_compliance_post_idx
  ON social_compliance_checks (post_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS social_compliance_ws_idx
  ON social_compliance_checks (workspace_id, checked_at DESC);

COMMENT ON TABLE social_compliance_checks IS
  'Append-only audit log of compliance scans. Never UPDATE rows. New scan = new row.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Performance metrics — pulled in after publishing, separate table so we can
-- snapshot over time without bloating social_posts.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_post_metrics (
  id              BIGSERIAL PRIMARY KEY,
  post_id         BIGINT       NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  workspace_id    VARCHAR(100) NOT NULL,
  platform        VARCHAR(20)  NOT NULL,

  impressions     BIGINT       NOT NULL DEFAULT 0,
  likes           BIGINT       NOT NULL DEFAULT 0,
  replies         BIGINT       NOT NULL DEFAULT 0,
  reposts         BIGINT       NOT NULL DEFAULT 0,
  saves           BIGINT       NOT NULL DEFAULT 0,
  link_clicks     BIGINT       NOT NULL DEFAULT 0,
  profile_visits  BIGINT       NOT NULL DEFAULT 0,
  engagement_rate NUMERIC(6,4),

  -- Provenance
  source          VARCHAR(60)  NOT NULL,             -- 'twitter_api' | 'instagram_graph' | 'manual'
  data_freshness  VARCHAR(20)  NOT NULL DEFAULT 'unknown',
  snapshot_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT social_post_metrics_platform_chk
    CHECK (platform IN ('x','instagram')),
  CONSTRAINT social_post_metrics_counts_nonneg_chk
    CHECK (
      impressions >= 0
      AND likes >= 0
      AND replies >= 0
      AND reposts >= 0
      AND saves >= 0
      AND link_clicks >= 0
      AND profile_visits >= 0
    ),
  CONSTRAINT social_post_metrics_freshness_chk
    CHECK (data_freshness IN ('fresh','delayed','stale','unknown'))
);

CREATE INDEX IF NOT EXISTS social_post_metrics_post_idx
  ON social_post_metrics (post_id, snapshot_at DESC);
CREATE INDEX IF NOT EXISTS social_post_metrics_ws_idx
  ON social_post_metrics (workspace_id, snapshot_at DESC);

COMMENT ON TABLE social_post_metrics IS
  'Performance metrics snapshots. Append a new row per pull — do not UPDATE.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Shared trigger functions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION block_update_delete_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only; % is not allowed', TG_TABLE_NAME, TG_OP;
END;
$$;

-- Keep updated_at consistent without relying on API routes.
DROP TRIGGER IF EXISTS trg_social_campaigns_set_updated_at ON social_campaigns;
CREATE TRIGGER trg_social_campaigns_set_updated_at
BEFORE UPDATE ON social_campaigns
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_social_posts_set_updated_at ON social_posts;
CREATE TRIGGER trg_social_posts_set_updated_at
BEFORE UPDATE ON social_posts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

-- Audit and metrics tables are append-only by design.
DROP TRIGGER IF EXISTS trg_social_compliance_checks_block_ud ON social_compliance_checks;
CREATE TRIGGER trg_social_compliance_checks_block_ud
BEFORE UPDATE OR DELETE ON social_compliance_checks
FOR EACH ROW
EXECUTE FUNCTION block_update_delete_append_only();

DROP TRIGGER IF EXISTS trg_social_post_metrics_block_ud ON social_post_metrics;
CREATE TRIGGER trg_social_post_metrics_block_ud
BEFORE UPDATE OR DELETE ON social_post_metrics
FOR EACH ROW
EXECUTE FUNCTION block_update_delete_append_only();

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed — first launch campaign (idempotent)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO social_campaigns (workspace_id, name, goal, offer, audience, tone, platforms, created_by)
SELECT
  'admin',
  'MSP Launch — Trial Drive',
  'Get beta / trial users on MarketScanner Pros — active retail traders who want structured analytics over single-indicator tips.',
  'Full Pro Access trial',
  'Active retail traders who want better structure, scanner tools, volatility context, and educational analytics. Frustrated by single-indicator setups and tipster-style newsletters. Want institutional-style lenses (regime, volatility, time confluence, structure) without a broker relationship.',
  'founder_led',
  ARRAY['x','instagram']::TEXT[],
  'admin_seed'
WHERE NOT EXISTS (
  SELECT 1 FROM social_campaigns
   WHERE workspace_id = 'admin' AND name = 'MSP Launch — Trial Drive'
);

COMMIT;
