import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import { buildResearchCaseOutcomeSuggestion, normalizeResearchCaseDirection, normalizeResearchCaseForSave } from '@/lib/researchCase';
import { retiredRouteResponse } from '@/lib/api/retiredRoute';
import { getLatestStateMachineBySymbol, type StoredStateMachineRow } from '@/lib/state-machine-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Saved research cases are one workspace's own data: never stored by a shared cache.
const PRIVATE = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie' };
const json = (body: unknown, init?: { status?: number }) => NextResponse.json(body, { status: init?.status ?? 200, headers: PRIVATE });

const SAVED_CASE_OUTCOMES = ['pending', 'confirmed', 'invalidated', 'expired', 'reviewed'] as const;
type SavedCaseOutcome = typeof SAVED_CASE_OUTCOMES[number];

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const saved = url.searchParams.get('saved') === 'true';
  const id = url.searchParams.get('id');

  if (saved || id) {
    return getSavedResearchCases(session.workspaceId, url);
  }

  // Live generation (?symbol=…) is retired: it published probability matrices, brain permission, a paper scenario
  // plan and an engine thesis, filled missing indicators with defaults, and had no caller in the app. Research cases
  // are built in the browser from the public page evidence and saved through POST.
  return retiredRouteResponse();
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const normalized = normalizeResearchCaseForSave(await req.json());
    const stateSnapshot = await getResearchCaseStateSnapshot(session.workspaceId, normalized.symbol, normalized.payload);
    const payload = stateSnapshot
      ? { ...normalized.payload, stateSnapshot }
      : normalized.payload;
    const rows = await q(
      `INSERT INTO saved_research_cases (
        workspace_id, symbol, asset_class, source_type, title, data_quality, generated_at,
        lifecycle_state, lifecycle_updated_at, state_snapshot_json, payload
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb)
      RETURNING id, symbol, asset_class, source_type, title, data_quality, generated_at,
        lifecycle_state, lifecycle_updated_at, state_snapshot_json, payload, created_at, updated_at`,
      [
        session.workspaceId,
        normalized.symbol,
        normalized.assetClass,
        normalized.sourceType,
        normalized.title,
        normalized.dataQuality,
        normalized.generatedAt,
        stateSnapshot?.state ?? null,
        stateSnapshot?.updatedAt ?? null,
        stateSnapshot ? JSON.stringify(stateSnapshot) : null,
        JSON.stringify(payload),
      ],
    );

    return json({ success: true, researchCase: mapSavedResearchCase(rows[0]) }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('required') || message.includes('valid symbol')) return json({ success: false, error: message }, { status: 400 });
    console.error('[research-case] save failed', err);
    return json({ success: false, error: 'Failed to save research case' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = new URL(req.url).searchParams.get('id');
  if (!id) {
    return json({ error: 'id required' }, { status: 400 });
  }

  try {
    const rows = await q(
      `DELETE FROM saved_research_cases
       WHERE workspace_id = $1 AND id = $2
       RETURNING id`,
      [session.workspaceId, id],
    );
    if (!rows[0]) {
      return json({ error: 'Research case not found' }, { status: 404 });
    }
    return json({ success: true, id: rows[0].id });
  } catch (err: unknown) {
    console.error('[research-case] delete failed', err);
    return json({ success: false, error: 'Failed to delete research case' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = new URL(req.url).searchParams.get('id');
  if (!id) {
    return json({ error: 'id required' }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const outcomeStatus = normalizeSavedCaseOutcome(body?.outcomeStatus ?? body?.status);
    const outcomeNote = typeof body?.outcomeNote === 'string'
      ? body.outcomeNote.trim().slice(0, 2000)
      : typeof body?.note === 'string'
      ? body.note.trim().slice(0, 2000)
      : null;
    const outcomeMetadata = typeof body?.outcomeMetadata === 'object' && body.outcomeMetadata !== null && !Array.isArray(body.outcomeMetadata)
      ? body.outcomeMetadata
      : {};

    const rows = await q(
      `UPDATE saved_research_cases
       SET outcome_status = $3,
           outcome_note = $4,
           outcome_reviewed_at = NOW(),
           outcome_metadata = $5::jsonb,
           updated_at = NOW()
       WHERE workspace_id = $1 AND id = $2
       RETURNING id, symbol, asset_class, source_type, title, data_quality, generated_at,
         lifecycle_state, lifecycle_updated_at, state_snapshot_json,
         outcome_status, outcome_note, outcome_reviewed_at, outcome_metadata,
         payload, created_at, updated_at`,
      [session.workspaceId, id, outcomeStatus, outcomeNote || null, JSON.stringify(outcomeMetadata)],
    );

    if (!rows[0]) {
      return json({ error: 'Research case not found' }, { status: 404 });
    }
    return json({ success: true, researchCase: mapSavedResearchCase(rows[0]) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('outcomeStatus')) return json({ success: false, error: message }, { status: 400 });
    console.error('[research-case] outcome update failed', err);
    return json({ success: false, error: 'Failed to update research case outcome' }, { status: 500 });
  }
}

async function getSavedResearchCases(workspaceId: string, url: URL) {
  const id = url.searchParams.get('id');
  const symbol = url.searchParams.get('symbol')?.trim().toUpperCase();
  const assetClass = url.searchParams.get('assetClass')?.trim().toLowerCase();
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 25)));

  if (id) {
    const rows = await q(
      `SELECT src.id, src.symbol, src.asset_class, src.source_type, src.title, src.data_quality, src.generated_at,
        src.lifecycle_state, src.lifecycle_updated_at, src.state_snapshot_json,
        src.outcome_status, src.outcome_note, src.outcome_reviewed_at, src.outcome_metadata,
        src.payload, src.created_at, src.updated_at,
        latest_state.state AS current_lifecycle_state,
        latest_state.updated_at AS current_lifecycle_updated_at,
        latest_state.transition_reason AS current_lifecycle_reason
       FROM saved_research_cases src
       LEFT JOIN LATERAL (
         SELECT state, updated_at, transition_reason
         FROM symbol_state_machine
         WHERE workspace_id::text = src.workspace_id
           AND symbol = src.symbol
         ORDER BY updated_at DESC
         LIMIT 1
       ) latest_state ON true
      WHERE src.workspace_id = $1 AND src.id = $2
       LIMIT 1`,
      [workspaceId, id],
    );
    if (!rows[0]) {
      return json({ error: 'Research case not found' }, { status: 404 });
    }
    return json({ success: true, researchCase: mapSavedResearchCase(rows[0]) });
  }

  const filters: string[] = ['src.workspace_id = $1'];
  const params: unknown[] = [workspaceId];
  let nextParam = 2;

  if (symbol) {
    filters.push(`src.symbol = $${nextParam++}`);
    params.push(symbol);
  }
  if (assetClass) {
    filters.push(`src.asset_class = $${nextParam++}`);
    params.push(assetClass);
  }
  params.push(limit);

  const rows = await q(
     `SELECT src.id, src.symbol, src.asset_class, src.source_type, src.title, src.data_quality, src.generated_at,
       src.lifecycle_state, src.lifecycle_updated_at, src.state_snapshot_json,
       src.outcome_status, src.outcome_note, src.outcome_reviewed_at, src.outcome_metadata,
       src.payload, src.created_at, src.updated_at,
       latest_state.state AS current_lifecycle_state,
       latest_state.updated_at AS current_lifecycle_updated_at,
       latest_state.transition_reason AS current_lifecycle_reason
     FROM saved_research_cases src
     LEFT JOIN LATERAL (
       SELECT state, updated_at, transition_reason
       FROM symbol_state_machine
       WHERE workspace_id::text = src.workspace_id
         AND symbol = src.symbol
       ORDER BY updated_at DESC
       LIMIT 1
     ) latest_state ON true
     WHERE ${filters.join(' AND ')}
    ORDER BY src.created_at DESC
     LIMIT $${nextParam}`,
    params,
  );

  return json({ success: true, researchCases: rows.map(mapSavedResearchCase) });
}

function mapSavedResearchCase(row: any) {
  return {
    id: row.id,
    symbol: row.symbol,
    assetClass: row.asset_class,
    sourceType: row.source_type,
    title: row.title,
    dataQuality: row.data_quality,
    generatedAt: row.generated_at,
    lifecycleState: row.lifecycle_state,
    lifecycleUpdatedAt: row.lifecycle_updated_at,
    stateSnapshot: row.state_snapshot_json,
    outcomeStatus: row.outcome_status ?? 'pending',
    outcomeNote: row.outcome_note,
    outcomeReviewedAt: row.outcome_reviewed_at,
    outcomeMetadata: row.outcome_metadata ?? {},
    currentLifecycleState: row.current_lifecycle_state ?? null,
    currentLifecycleUpdatedAt: row.current_lifecycle_updated_at ?? null,
    currentLifecycleReason: row.current_lifecycle_reason ?? null,
    outcomeSuggestion: buildResearchCaseOutcomeSuggestion({
      savedState: row.lifecycle_state,
      currentState: row.current_lifecycle_state,
      createdAt: row.created_at,
      currentUpdatedAt: row.current_lifecycle_updated_at,
      outcomeStatus: row.outcome_status,
    }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    researchCase: row.payload,
  };
}

function normalizeSavedCaseOutcome(value: unknown): SavedCaseOutcome {
  const raw = String(value || '').trim().toLowerCase();
  if (SAVED_CASE_OUTCOMES.includes(raw as SavedCaseOutcome)) return raw as SavedCaseOutcome;
  throw new Error(`outcomeStatus must be one of: ${SAVED_CASE_OUTCOMES.join(', ')}`);
}

async function getResearchCaseStateSnapshot(workspaceId: string, symbol: string, payload: Record<string, unknown>) {
  try {
    const direction = normalizeResearchCaseDirection(payload);
    const latest = await getLatestStateMachineBySymbol(workspaceId, symbol, undefined, direction);
    return latest ? mapStateSnapshot(latest) : null;
  } catch (error) {
    console.warn('[research-case] state snapshot unavailable', error instanceof Error ? error.message : error);
    return null;
  }
}

function mapStateSnapshot(row: StoredStateMachineRow) {
  const stateMachine = row.state_machine_json || {};
  const nextBestAction = typeof stateMachine === 'object' && stateMachine !== null
    ? (stateMachine as { next_best_action?: unknown }).next_best_action ?? null
    : null;

  return {
    symbol: row.symbol,
    playbook: row.playbook,
    direction: row.direction,
    state: row.state,
    previousState: row.previous_state,
    stateSince: row.state_since,
    updatedAt: row.updated_at,
    brainScore: row.brain_score,
    stateConfidence: row.state_confidence,
    transitionReason: row.transition_reason,
    lastEvent: row.last_event,
    nextBestAction,
  };
}
