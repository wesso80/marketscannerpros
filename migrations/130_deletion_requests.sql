-- A customer's request to delete their data.
-- The app insert writes workspace_id, customer_id, requested_at, and status,
-- and updates the same workspace on conflict.
-- Safe to run more than once. Apply by hand; this file is not executed by the app.

CREATE TABLE IF NOT EXISTS deletion_requests (
    workspace_id TEXT PRIMARY KEY,
    customer_id TEXT,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'pending'
);
