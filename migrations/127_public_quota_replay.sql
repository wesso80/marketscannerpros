-- Durable private response storage for safe AI retries; never returned by usage/status endpoints.
ALTER TABLE public_daily_quota_entries ADD COLUMN IF NOT EXISTS response_json jsonb;
