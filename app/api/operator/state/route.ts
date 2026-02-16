import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

type OperatorPulsePayload = {
  current_focus?: string;
  active_candidates?: string[];
  risk_environment?: string;
  ai_attention_score?: number;
  user_mode?: string;
  cognitive_load?: number;
  context_state?: Record<string, unknown>;
  last_actions?: Array<Record<string, unknown>>;
  source_module?: string;
};

function toFinite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export async function GET() {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rows = await q(
      `SELECT
         workspace_id,
         current_focus,
         active_candidates,
         risk_environment,
         ai_attention_score,
         user_mode,
         cognitive_load,
         context_state,
         last_actions,
         source_module,
         updated_at,
         created_at
       FROM operator_state
       WHERE workspace_id = $1
       LIMIT 1`,
      [session.workspaceId]
    );

    return NextResponse.json({ state: rows[0] || null });
  } catch (error) {
    console.error('Operator state GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch operator state' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as OperatorPulsePayload;

    const currentFocus = typeof body?.current_focus === 'string' ? body.current_focus.slice(0, 120) : null;
    const activeCandidates = Array.isArray(body?.active_candidates)
      ? body.active_candidates.filter((item) => typeof item === 'string').slice(0, 25)
      : [];
    const riskEnvironment = typeof body?.risk_environment === 'string' ? body.risk_environment.slice(0, 60) : null;
    const aiAttentionScore = toFinite(body?.ai_attention_score);
    const userMode = typeof body?.user_mode === 'string' ? body.user_mode.slice(0, 40) : null;
    const cognitiveLoad = toFinite(body?.cognitive_load);
    const contextState = body?.context_state && typeof body.context_state === 'object' ? body.context_state : {};
    const lastActions = Array.isArray(body?.last_actions) ? body.last_actions.slice(0, 20) : [];
    const sourceModule = typeof body?.source_module === 'string' ? body.source_module.slice(0, 60) : null;

    await q(
      `INSERT INTO operator_state (
         workspace_id,
         current_focus,
         active_candidates,
         risk_environment,
         ai_attention_score,
         user_mode,
         cognitive_load,
         context_state,
         last_actions,
         source_module,
         updated_at
       ) VALUES (
         $1,
         $2,
         $3::jsonb,
         $4,
         $5,
         $6,
         $7,
         $8::jsonb,
         $9::jsonb,
         $10,
         NOW()
       )
       ON CONFLICT (workspace_id)
       DO UPDATE SET
         current_focus = EXCLUDED.current_focus,
         active_candidates = EXCLUDED.active_candidates,
         risk_environment = EXCLUDED.risk_environment,
         ai_attention_score = EXCLUDED.ai_attention_score,
         user_mode = EXCLUDED.user_mode,
         cognitive_load = EXCLUDED.cognitive_load,
         context_state = EXCLUDED.context_state,
         last_actions = EXCLUDED.last_actions,
         source_module = EXCLUDED.source_module,
         updated_at = NOW()`,
      [
        session.workspaceId,
        currentFocus,
        JSON.stringify(activeCandidates),
        riskEnvironment,
        aiAttentionScore,
        userMode,
        cognitiveLoad,
        JSON.stringify(contextState),
        JSON.stringify(lastActions),
        sourceModule,
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Operator state POST error:', error);
    return NextResponse.json({ error: 'Failed to update operator state' }, { status: 500 });
  }
}
