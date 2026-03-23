-- Stores user acceptance of the platform disclosure / terms acknowledgement
CREATE TABLE IF NOT EXISTS disclosure_acceptance (
  workspace_id UUID PRIMARY KEY,
  version      TEXT NOT NULL DEFAULT '1',
  accepted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
