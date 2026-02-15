-- Institutional State Machine persistence (workspace-scoped)

CREATE TABLE IF NOT EXISTS symbol_state_machine (
  id BIGSERIAL PRIMARY KEY,
  workspace_id UUID NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  playbook VARCHAR(50) NOT NULL,
  direction VARCHAR(10) NOT NULL,

  state VARCHAR(20) NOT NULL,
  previous_state VARCHAR(20),

  state_since TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  brain_score FLOAT,
  state_confidence FLOAT,

  transition_reason TEXT,
  last_event VARCHAR(50),

  gates_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  state_machine_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT symbol_state_machine_direction_check CHECK (direction IN ('long','short')),
  CONSTRAINT symbol_state_machine_state_check CHECK (state IN ('SCAN','WATCH','STALK','ARMED','EXECUTE','MANAGE','COOLDOWN','BLOCKED')),
  CONSTRAINT symbol_state_machine_unique UNIQUE (workspace_id, symbol, playbook, direction)
);

CREATE INDEX IF NOT EXISTS idx_symbol_state_machine_ws_symbol
  ON symbol_state_machine (workspace_id, symbol, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_symbol_state_machine_state
  ON symbol_state_machine (workspace_id, state, updated_at DESC);

CREATE TABLE IF NOT EXISTS symbol_state_transitions (
  id BIGSERIAL PRIMARY KEY,
  workspace_id UUID NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  playbook VARCHAR(50) NOT NULL,
  direction VARCHAR(10) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  old_state VARCHAR(20) NOT NULL,
  new_state VARCHAR(20) NOT NULL,
  transition_reason TEXT,
  decision_confidence FLOAT,
  emitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  transition_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_symbol_state_transitions_ws_symbol
  ON symbol_state_transitions (workspace_id, symbol, emitted_at DESC);
