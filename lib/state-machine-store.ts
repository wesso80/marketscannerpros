import { q } from '@/lib/db';
import { InstitutionalState, InstitutionalStateMachineOutput, StateDirection, StateEventType } from './institutional-state-machine';

export interface StoredStateMachineRow {
  id: number;
  workspace_id: string;
  symbol: string;
  playbook: string;
  direction: StateDirection;
  state: InstitutionalState;
  previous_state: InstitutionalState | null;
  state_since: string;
  updated_at: string;
  brain_score: number | null;
  state_confidence: number | null;
  transition_reason: string | null;
  last_event: StateEventType | null;
  gates_json: Record<string, unknown>;
  state_machine_json: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface UpsertStateMachineInput {
  workspaceId: string;
  symbol: string;
  playbook: string;
  direction: StateDirection;
  eventType: StateEventType;
  output: InstitutionalStateMachineOutput;
  brainScore?: number;
  stateConfidence?: number;
  metadata?: Record<string, unknown>;
}

export interface StateTransitionRow {
  id: number;
  workspace_id: string;
  symbol: string;
  playbook: string;
  direction: StateDirection;
  event_type: StateEventType;
  old_state: InstitutionalState;
  new_state: InstitutionalState;
  transition_reason: string | null;
  decision_confidence: number | null;
  emitted_at: string;
  transition_json: Record<string, unknown>;
}

export async function getLatestStateMachine(
  workspaceId: string,
  symbol: string,
  playbook: string,
  direction: StateDirection
): Promise<StoredStateMachineRow | null> {
  const rows = await q<StoredStateMachineRow>(
    `SELECT *
     FROM symbol_state_machine
     WHERE workspace_id = $1
       AND symbol = $2
       AND playbook = $3
       AND direction = $4
     ORDER BY updated_at DESC
     LIMIT 1`,
    [workspaceId, symbol.toUpperCase(), playbook, direction]
  );

  return rows[0] ?? null;
}

export async function getLatestStateMachineBySymbol(
  workspaceId: string,
  symbol: string,
  playbook?: string,
  direction?: StateDirection
): Promise<StoredStateMachineRow | null> {
  const rows = await q<StoredStateMachineRow>(
    `SELECT *
     FROM symbol_state_machine
     WHERE workspace_id = $1
       AND symbol = $2
       AND ($3::text IS NULL OR playbook = $3)
       AND ($4::text IS NULL OR direction = $4)
     ORDER BY updated_at DESC
     LIMIT 1`,
    [workspaceId, symbol.toUpperCase(), playbook ?? null, direction ?? null]
  );

  return rows[0] ?? null;
}

export async function listLatestStateMachines(
  workspaceId: string,
  limit = 25
): Promise<StoredStateMachineRow[]> {
  const cappedLimit = Math.max(1, Math.min(100, limit));
  return q<StoredStateMachineRow>(
    `SELECT *
     FROM symbol_state_machine
     WHERE workspace_id = $1
     ORDER BY updated_at DESC
     LIMIT $2`,
    [workspaceId, cappedLimit]
  );
}

export async function listStateTransitions(
  workspaceId: string,
  symbol: string,
  playbook?: string,
  direction?: StateDirection,
  limit = 20
): Promise<StateTransitionRow[]> {
  const cappedLimit = Math.max(1, Math.min(200, limit));
  return q<StateTransitionRow>(
    `SELECT *
     FROM symbol_state_transitions
     WHERE workspace_id = $1
       AND symbol = $2
       AND ($3::text IS NULL OR playbook = $3)
       AND ($4::text IS NULL OR direction = $4)
     ORDER BY emitted_at DESC
     LIMIT $5`,
    [workspaceId, symbol.toUpperCase(), playbook ?? null, direction ?? null, cappedLimit]
  );
}

export async function upsertStateMachine(input: UpsertStateMachineInput): Promise<void> {
  await q(
    `INSERT INTO symbol_state_machine (
      workspace_id, symbol, playbook, direction,
      state, previous_state, state_since, updated_at,
      brain_score, state_confidence, transition_reason, last_event,
      gates_json, state_machine_json, metadata
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6, $7::timestamptz, NOW(),
      $8, $9, $10, $11,
      $12::jsonb, $13::jsonb, $14::jsonb
    )
    ON CONFLICT (workspace_id, symbol, playbook, direction)
    DO UPDATE SET
      state = EXCLUDED.state,
      previous_state = EXCLUDED.previous_state,
      state_since = EXCLUDED.state_since,
      updated_at = NOW(),
      brain_score = EXCLUDED.brain_score,
      state_confidence = EXCLUDED.state_confidence,
      transition_reason = EXCLUDED.transition_reason,
      last_event = EXCLUDED.last_event,
      gates_json = EXCLUDED.gates_json,
      state_machine_json = EXCLUDED.state_machine_json,
      metadata = EXCLUDED.metadata`,
    [
      input.workspaceId,
      input.symbol.toUpperCase(),
      input.playbook,
      input.direction,
      input.output.state_machine.state,
      input.output.state_machine.previous_state,
      input.output.state_machine.state_since,
      input.brainScore ?? null,
      input.stateConfidence ?? null,
      input.output.transition.reason,
      input.eventType,
      JSON.stringify(input.output.state_machine.gates),
      JSON.stringify(input.output.state_machine),
      JSON.stringify(input.metadata ?? {}),
    ]
  );

  await q(
    `INSERT INTO symbol_state_transitions (
      workspace_id, symbol, playbook, direction,
      event_type, old_state, new_state,
      transition_reason, decision_confidence, transition_json
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6, $7,
      $8, $9, $10::jsonb
    )`,
    [
      input.workspaceId,
      input.symbol.toUpperCase(),
      input.playbook,
      input.direction,
      input.eventType,
      input.output.transition.old_state,
      input.output.transition.new_state,
      input.output.transition.reason,
      input.output.state_machine.audit.decision_confidence,
      JSON.stringify(input.output.transition),
    ]
  );
}
