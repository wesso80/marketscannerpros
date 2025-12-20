-- Delete Requests table for GDPR compliance
-- Run this SQL in your Vercel Postgres database

CREATE TABLE IF NOT EXISTS delete_requests (
    id SERIAL PRIMARY KEY,
    workspace_id VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    reason TEXT,
    status VARCHAR(50) DEFAULT 'pending',  -- pending, processing, completed, rejected
    created_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP,
    admin_notes TEXT
);

-- Index for quick status lookups
CREATE INDEX IF NOT EXISTS idx_delete_requests_status 
ON delete_requests (status, created_at);

-- Index for workspace lookups
CREATE INDEX IF NOT EXISTS idx_delete_requests_workspace 
ON delete_requests (workspace_id);
