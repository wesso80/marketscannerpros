-- Shared CoinGecko fallback shelf for a Redis outage.
-- One row per UTC day and process role. The web row is the only one that
-- admits calls, and only up to floor(flat daily cap / (estimated processes * 4)).
-- A missing table fails closed: user reads serve cache and jobs skip the call.
-- Apply by hand. This file is not executed by the app.
CREATE TABLE IF NOT EXISTS cg_call_shelf (
  day date NOT NULL,
  role text NOT NULL CHECK (role IN ('web', 'worker', 'jarvis')),
  spent integer NOT NULL DEFAULT 0 CHECK (spent >= 0),
  timeouts integer NOT NULL DEFAULT 0 CHECK (timeouts >= 0),
  PRIMARY KEY (day, role)
);
