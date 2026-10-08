-- One automatic AI summary attempt per public instrument/day, separate from submitted question quotas.
CREATE TABLE IF NOT EXISTS public_report_summaries (
 subject_key text NOT NULL,
 quota_day date NOT NULL,
 resource_key text NOT NULL,
 fingerprint text NOT NULL,
 state text NOT NULL CHECK(state IN ('pending','ready','unavailable')),
 narrative text,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(subject_key,quota_day,resource_key)
);
