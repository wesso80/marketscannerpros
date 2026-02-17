-- Decision packet trace performance indexes
-- Supports /api/workflow/decision-packet?id=<decision_packet_id>

CREATE INDEX IF NOT EXISTS idx_ai_events_payload_decision_packet_id
  ON ai_events ((event_data->'payload'->>'decision_packet_id'));

CREATE INDEX IF NOT EXISTS idx_ai_events_payload_setup_decision_packet_id
  ON ai_events ((event_data->'payload'->'setup'->>'decision_packet_id'));

CREATE INDEX IF NOT EXISTS idx_ai_events_payload_links_decision_packet_id
  ON ai_events ((event_data->'payload'->'links'->>'decision_packet_id'));

CREATE INDEX IF NOT EXISTS idx_ai_events_payload_trade_plan_setup_decision_packet_id
  ON ai_events ((event_data->'payload'->'trade_plan'->'setup'->>'decision_packet_id'));

CREATE INDEX IF NOT EXISTS idx_ai_events_payload_trade_plan_links_decision_packet_id
  ON ai_events ((event_data->'payload'->'trade_plan'->'links'->>'decision_packet_id'));

CREATE INDEX IF NOT EXISTS idx_ai_events_payload_decision_packet_id_nested
  ON ai_events ((event_data->'payload'->'decision_packet'->>'id'));

CREATE INDEX IF NOT EXISTS idx_ai_events_entity_entity_id
  ON ai_events ((event_data->'entity'->>'entity_id'));

CREATE INDEX IF NOT EXISTS idx_alerts_smart_context_decision_packet_id
  ON alerts ((smart_alert_context->>'decisionPacketId'))
  WHERE is_smart_alert = true;

CREATE INDEX IF NOT EXISTS idx_alerts_smart_context_decision_packet_id_snake
  ON alerts ((smart_alert_context->>'decision_packet_id'))
  WHERE is_smart_alert = true;

CREATE INDEX IF NOT EXISTS idx_journal_entries_tags_gin
  ON journal_entries USING GIN (tags);
