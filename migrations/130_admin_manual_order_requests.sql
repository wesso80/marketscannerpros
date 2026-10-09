-- Admin-only manual simulated-order receipts. Apply explicitly before enabling the updated route.
-- Retain receipts across portfolio resets so retries cannot create an order in a replacement account.
CREATE TABLE IF NOT EXISTS admin_manual_order_requests (
  workspace_id UUID NOT NULL,
  request_key TEXT NOT NULL CHECK (length(request_key) BETWEEN 16 AND 128),
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  response_status INTEGER NOT NULL CHECK (response_status BETWEEN 200 AND 499),
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, request_key)
);
