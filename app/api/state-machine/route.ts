import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import {
  getLatestStateMachineBySymbol,
  listLatestStateMachines,
  listStateTransitions,
} from '@/lib/state-machine-store';

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const symbol = (url.searchParams.get('symbol') || '').toUpperCase().trim();
    const playbook = (url.searchParams.get('playbook') || '').toLowerCase().trim() || undefined;
    const directionRaw = (url.searchParams.get('direction') || '').toLowerCase().trim();
    const direction = directionRaw === 'short' || directionRaw === 'long' ? directionRaw : undefined;
    const includeHistory = (url.searchParams.get('includeHistory') || 'true').toLowerCase() !== 'false';
    const limit = Number(url.searchParams.get('limit') || (symbol ? 20 : 25));

    if (!symbol) {
      const rows = await listLatestStateMachines(session.workspaceId, limit);
      return NextResponse.json({
        success: true,
        data: {
          rows: rows.map((row) => ({
            symbol: row.symbol,
            playbook: row.playbook,
            direction: row.direction,
            state: row.state,
            previous_state: row.previous_state,
            state_since: row.state_since,
            updated_at: row.updated_at,
            brain_score: row.brain_score,
            state_confidence: row.state_confidence,
            transition_reason: row.transition_reason,
            last_event: row.last_event,
            state_machine: row.state_machine_json,
          })),
        },
      });
    }

    const latest = await getLatestStateMachineBySymbol(
      session.workspaceId,
      symbol,
      playbook,
      direction as 'long' | 'short' | undefined
    );

    if (!latest) {
      return NextResponse.json({
        success: false,
        error: 'No state machine snapshot found for symbol',
      }, { status: 404 });
    }

    const transitions = includeHistory
      ? await listStateTransitions(
          session.workspaceId,
          symbol,
          playbook,
          direction as 'long' | 'short' | undefined,
          limit
        )
      : [];

    return NextResponse.json({
      success: true,
      data: {
        symbol: latest.symbol,
        playbook: latest.playbook,
        direction: latest.direction,
        state: latest.state,
        previous_state: latest.previous_state,
        state_since: latest.state_since,
        updated_at: latest.updated_at,
        brain_score: latest.brain_score,
        state_confidence: latest.state_confidence,
        transition_reason: latest.transition_reason,
        last_event: latest.last_event,
        gates: latest.gates_json,
        state_machine: latest.state_machine_json,
        transitions: transitions.map((row) => ({
          id: row.id,
          event_type: row.event_type,
          old_state: row.old_state,
          new_state: row.new_state,
          transition_reason: row.transition_reason,
          decision_confidence: row.decision_confidence,
          emitted_at: row.emitted_at,
          transition: row.transition_json,
        })),
      },
    });
  } catch (error) {
    console.error('[state-machine] API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load state machine data',
    }, { status: 500 });
  }
}
