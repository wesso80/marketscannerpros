-- Crypto signal ledger: every 4h momentum signal, taken or skipped, with hypothetical outcomes (research only).
CREATE TABLE IF NOT EXISTS crypto_signal_ledger (
  signal_id      TEXT PRIMARY KEY,
  source         TEXT NOT NULL,
  coin           TEXT NOT NULL,
  product        TEXT,
  venue          TEXT,
  kind           TEXT,
  signal_at      TIMESTAMPTZ NOT NULL,
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decision       TEXT NOT NULL CHECK (decision IN ('TAKEN','SKIPPED')),
  reasons        TEXT[] NOT NULL DEFAULT '{}',
  position_ids   TEXT[] NOT NULL DEFAULT '{}',
  signal         JSONB,
  features       JSONB,
  entry          JSONB,
  outcomes       JSONB,
  status         TEXT NOT NULL CHECK (status IN ('PENDING','RESOLVED','UNAVAILABLE','LINKED')),
  reason         TEXT,
  resolved_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS crypto_signal_ledger_status_idx ON crypto_signal_ledger (status, signal_at);
