import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import {
  evaluateAutoAlertPolicy,
  evaluateSystemExecutionPolicy,
  getRiskGovernorThresholdsFromEnv,
} from '@/lib/operator/riskGovernor';

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toBoolean(value: string | null, fallback: boolean): boolean {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return fallback;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const requestedPlanRiskScore = toFiniteNumber(url.searchParams.get('planRiskScore'));
    const isSystemActor = toBoolean(url.searchParams.get('systemActor'), true);

    const [stateRows, autoAlertRows] = await Promise.all([
      q<{
        risk_environment: string | null;
        cognitive_load: number | null;
        context_state: Record<string, unknown> | null;
        updated_at: string;
      }>(
        `SELECT risk_environment, cognitive_load, context_state, updated_at
         FROM operator_state
         WHERE workspace_id = $1
         LIMIT 1`,
        [session.workspaceId]
      ),
      q<{ alerts_last_hour: number; alerts_today: number }>(
        `SELECT
           COUNT(*) FILTER (
             WHERE created_at >= NOW() - INTERVAL '1 hour'
           )::int AS alerts_last_hour,
           COUNT(*) FILTER (
             WHERE created_at >= CURRENT_DATE
           )::int AS alerts_today
         FROM alerts
         WHERE workspace_id = $1
           AND is_smart_alert = true
           AND smart_alert_context->>'source' = 'workflow.auto'`,
        [session.workspaceId]
      ),
    ]);

    const thresholds = getRiskGovernorThresholdsFromEnv();
    const state = stateRows[0];
    const counts = autoAlertRows[0];

    const context = (state?.context_state || {}) as Record<string, unknown>;
    const executionAutomationOptIn = context.executionAutomationOptIn === true
      || String(context.executionAutomationOptIn || '').toLowerCase() === 'true';

    const autoAlertDecision = evaluateAutoAlertPolicy(
      {
        riskEnvironment: state?.risk_environment || null,
        cognitiveLoad: toFiniteNumber(state?.cognitive_load),
        autoAlertsLastHour: Number(counts?.alerts_last_hour || 0),
        autoAlertsToday: Number(counts?.alerts_today || 0),
        planRiskScore: requestedPlanRiskScore,
      },
      thresholds
    );

    const systemExecutionDecision = evaluateSystemExecutionPolicy(
      {
        isSystemActor,
        executionOptIn: executionAutomationOptIn,
      },
      thresholds
    );

    return NextResponse.json({
      workspaceId: session.workspaceId,
      asOf: new Date().toISOString(),
      thresholds,
      snapshot: {
        riskEnvironment: state?.risk_environment || null,
        cognitiveLoad: toFiniteNumber(state?.cognitive_load),
        executionAutomationOptIn,
        autoAlertsLastHour: Number(counts?.alerts_last_hour || 0),
        autoAlertsToday: Number(counts?.alerts_today || 0),
        stateUpdatedAt: state?.updated_at || null,
      },
      debugInput: {
        requestedPlanRiskScore,
        systemActor: isSystemActor,
      },
      decisions: {
        autoAlert: autoAlertDecision,
        systemExecution: systemExecutionDecision,
      },
    });
  } catch (error) {
    console.error('Risk governor debug GET error:', error);
    return NextResponse.json({ error: 'Failed to evaluate risk governor state' }, { status: 500 });
  }
}
