-- Numbered 132 because 130_admin_manual_order_requests.sql already belongs to admin-integration.
-- Matches the live deletion_requests table. workspace_id is unique there, and
-- processed_at and admin_notes already exist. CREATE TABLE IF NOT EXISTS is a
-- no-op on production. Apply by hand; this file is not executed by the app.

CREATE TABLE IF NOT EXISTS deletion_requests (
    id SERIAL PRIMARY KEY,
    workspace_id TEXT NOT NULL UNIQUE,
    customer_id TEXT,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'pending',
    processed_at TIMESTAMPTZ,
    admin_notes TEXT
);
