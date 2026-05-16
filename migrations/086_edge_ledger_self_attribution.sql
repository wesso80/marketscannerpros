-- migrations/086_edge_ledger_self_attribution.sql
-- The operator's actual behaviour vs the system's suggestion.
-- Links a setup_id to a journal_entry (if taken) and captures
-- the deltas that make behavioral drift / regret reports possible.

CREATE TABLE IF NOT EXISTS edge_ledger_self_attribution (
  id                BIGSERIAL PRIMARY KEY,
  workspace_id      UUID        NOT NULL,
  setup_id          BIGINT      NOT NULL REFERENCES edge_ledger_setups(id) ON DELETE CASCADE,
  journal_entry_id  UUID,                                       -- nullable: setup may be skipped

  -- Operator decision
  action            VARCHAR(16) NOT NULL,                       -- 'taken' | 'skipped' | 'partial' | 'modified'
  override_reason   TEXT,                                       -- free text when operator overrode checklist

  -- Delta vs suggested
  size_delta_pct    NUMERIC(8,2),                               -- (actual_size - suggested_size) / suggested_size * 100
  entry_delta_bps   NUMERIC(10,4),                              -- bps drift from suggested entry
  stop_delta_pct    NUMERIC(10,4),                              -- pct drift from suggested stop
  target_delta_pct  NUMERIC(10,4),

  -- Checklist gating
  checklist_overrides JSONB,                                    -- which gates were bypassed: ['regime', 'evidence', 'exposure']

  -- Behavioural flags
  was_revenge_trade BOOLEAN,                                    -- true if entered within X mins of a stopped loss
  was_overtrade     BOOLEAN,                                    -- true if Nth trade today over operator's daily cap

  recorded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_edge_attrib_ws_time
  ON edge_ledger_self_attribution (workspace_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_edge_attrib_setup
  ON edge_ledger_self_attribution (setup_id);

CREATE INDEX IF NOT EXISTS idx_edge_attrib_journal
  ON edge_ledger_self_attribution (journal_entry_id) WHERE journal_entry_id IS NOT NULL;
