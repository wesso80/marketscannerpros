-- Idempotency gate for Stripe webhook side effects (welcome email, referral credit).
-- A resent event has the same event id as the automatic retry. The insert is the claim:
-- ON CONFLICT DO NOTHING means a second delivery does not run those side effects again.
-- Safe to run more than once. Apply by hand; this file is not executed by the app.

CREATE TABLE IF NOT EXISTS stripe_processed_events (
    event_id TEXT PRIMARY KEY,
    event_type TEXT,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
