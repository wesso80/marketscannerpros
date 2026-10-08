-- Additive public quota ledger. Apply through normal migration review; no production execution here.
CREATE TABLE IF NOT EXISTS public_daily_quota_buckets (
  subject_key text NOT NULL,
  quota_day date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('symbol', 'ai')),
  PRIMARY KEY (subject_key, quota_day, kind)
);
CREATE TABLE IF NOT EXISTS public_daily_quota_entries (
  subject_key text NOT NULL,
  quota_day date NOT NULL,
  kind text NOT NULL,
  resource_key text NOT NULL,
  fingerprint text NOT NULL,
  token uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('reserved', 'completed', 'released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subject_key, quota_day, kind, resource_key),
  FOREIGN KEY (subject_key, quota_day, kind) REFERENCES public_daily_quota_buckets ON DELETE CASCADE
);
-- No automatic expiry of reservations: an interrupted provider call has an unknown outcome.
-- Release only a confirmed failure; reconcile unknown outcomes before reopening capacity.
