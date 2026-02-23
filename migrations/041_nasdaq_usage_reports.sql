-- ============================================================
-- Migration 041: nasdaq_usage_reports
-- Tracks monthly Nasdaq usage reporting for compliance with
-- Nasdaq Reporting Policy (Version 2.23).
-- Distributors must submit usage reports by the 15th of the
-- following month listing all subscribers with potential
-- access to Nasdaq data during the reporting period.
-- ============================================================

CREATE TABLE IF NOT EXISTS nasdaq_usage_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reporting period (calendar month)
  report_month      DATE         NOT NULL,  -- first day of month, e.g. '2026-01-01'

  -- Subscriber counts by category
  professional_subscribers      INT NOT NULL DEFAULT 0,
  non_professional_subscribers  INT NOT NULL DEFAULT 0,
  total_subscribers             INT NOT NULL DEFAULT 0,

  -- Data product breakdown
  realtime_users      INT NOT NULL DEFAULT 0,
  delayed_users       INT NOT NULL DEFAULT 0,

  -- Tier breakdown (MSP-specific)
  free_tier_count     INT NOT NULL DEFAULT 0,
  pro_tier_count      INT NOT NULL DEFAULT 0,
  pro_trader_count    INT NOT NULL DEFAULT 0,
  trial_count         INT NOT NULL DEFAULT 0,

  -- Submission tracking
  report_type         VARCHAR(30)  NOT NULL DEFAULT 'monthly_summary',
    -- monthly_summary | monthly_detailed | annual_summary | revised
  status              VARCHAR(20)  NOT NULL DEFAULT 'draft',
    -- draft | submitted | revised | late
  submitted_at        TIMESTAMPTZ,
  submitted_by        VARCHAR(255),           -- admin email
  submission_ref      VARCHAR(100),           -- Nasdaq Data-Client Portal reference
  revision_of         UUID REFERENCES nasdaq_usage_reports(id),

  -- Deadline tracking
  due_date            DATE NOT NULL,          -- 15th of month+1
  revision_deadline   DATE NOT NULL,          -- due_date + 2 months

  -- Notes / attachments
  notes               TEXT,

  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- One report per month per type (prevent duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS idx_nasdaq_reports_month_type
  ON nasdaq_usage_reports (report_month, report_type)
  WHERE revision_of IS NULL;

-- Quick lookup by status
CREATE INDEX IF NOT EXISTS idx_nasdaq_reports_status
  ON nasdaq_usage_reports (status);

-- Deadline alerts
CREATE INDEX IF NOT EXISTS idx_nasdaq_reports_due
  ON nasdaq_usage_reports (due_date);
