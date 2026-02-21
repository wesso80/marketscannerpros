import { q } from '@/lib/db';
import type { Regime } from '@/lib/risk-governor-hard';

type EventSeverity = 'none' | 'medium' | 'high';
type DataStatus = 'OK' | 'DEGRADED' | 'DOWN';

export type RuntimeRiskSnapshotInput = {
  regime: Regime;
  dataStatus: DataStatus;
  dataAgeSeconds: number;
  eventSeverity: EventSeverity;
  realizedDailyR: number;
  openRiskR: number;
  consecutiveLosses: number;
};

function toFinite(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function mapRiskEnvironmentToRegime(riskEnvironment: string): Regime {
  const normalized = String(riskEnvironment || '').toLowerCase();
  if (normalized.includes('risk_off') || normalized.includes('stress') || normalized.includes('overloaded')) return 'RISK_OFF_STRESS';
  if (normalized.includes('trend_down') || normalized.includes('bear')) return 'TREND_DOWN';
  if (normalized.includes('trend_up') || normalized.includes('bull')) return 'TREND_UP';
  if (normalized.includes('expansion') || normalized.includes('high_vol')) return 'VOL_EXPANSION';
  if (normalized.includes('compression') || normalized.includes('low_vol')) return 'VOL_CONTRACTION';
  if (normalized.includes('range')) return 'RANGE_NEUTRAL';
  return 'RANGE_NEUTRAL';
}

function inferEventSeverity(args: { riskEnvironment: string; contextState: Record<string, any> }): EventSeverity {
  const riskEnv = String(args.riskEnvironment || '').toLowerCase();
  const context = args.contextState || {};

  const explicit = String(
    context?.eventSeverity
    || context?.event_severity
    || context?.macroEventSeverity
    || context?.marketEventSeverity
    || context?.calendarEventSeverity
    || ''
  ).toLowerCase();

  if (explicit === 'high' || explicit === 'medium' || explicit === 'none') {
    return explicit;
  }

  const eventWindowActive = context?.eventWindowActive === true
    || String(context?.eventWindowActive || '').toLowerCase() === 'true';

  if (eventWindowActive) return 'high';
  if (riskEnv.includes('event') || riskEnv.includes('news') || riskEnv.includes('fomc') || riskEnv.includes('cpi')) return 'high';
  return 'none';
}

function inferDataStatus(ageSeconds: number): DataStatus {
  if (ageSeconds > 60) return 'DOWN';
  if (ageSeconds > 30) return 'DEGRADED';
  return 'OK';
}

function computeConsecutiveLosses(rows: Array<{ outcome: string | null; pl: string | number | null }>): number {
  let streak = 0;
  for (const row of rows) {
    const outcome = String(row.outcome || '').toLowerCase();
    const pl = toFinite(row.pl, 0);
    const isLoss = outcome === 'loss' || (outcome !== 'win' && outcome !== 'breakeven' && pl < 0);

    if (isLoss) {
      streak += 1;
      continue;
    }

    break;
  }
  return streak;
}

export async function getRuntimeRiskSnapshotInput(workspaceId: string): Promise<RuntimeRiskSnapshotInput> {
  const [
    stateRows,
    realizedRows,
    openRiskRows,
    streakRows,
  ] = await Promise.all([
    q<{ risk_environment: string | null; context_state: Record<string, any> | null; updated_at: string | null }>(
      `SELECT risk_environment, context_state, updated_at
         FROM operator_state
        WHERE workspace_id = $1
        LIMIT 1`,
      [workspaceId]
    ),
    q<{ realized_daily_r: string | number | null }>(
      `SELECT COALESCE(SUM(COALESCE(dynamic_r, r_multiple, 0)), 0) AS realized_daily_r
         FROM journal_entries
        WHERE workspace_id = $1
          AND trade_date = CURRENT_DATE
          AND is_open = false`,
      [workspaceId]
    ),
    q<{ open_risk_r: string | number | null }>(
      `SELECT COALESCE(SUM(
          CASE
            WHEN is_open = true
             AND COALESCE(risk_amount, 0) > 0
             AND COALESCE(equity_at_entry, 0) > 0
             AND COALESCE(risk_per_trade_at_entry, 0) > 0
            THEN risk_amount / (equity_at_entry * risk_per_trade_at_entry)
            ELSE 0
          END
        ), 0) AS open_risk_r
         FROM journal_entries
        WHERE workspace_id = $1`,
      [workspaceId]
    ),
    q<{ outcome: string | null; pl: string | number | null }>(
      `SELECT outcome, pl
         FROM journal_entries
        WHERE workspace_id = $1
          AND is_open = false
        ORDER BY trade_date DESC, created_at DESC
        LIMIT 10`,
      [workspaceId]
    ),
  ]);

  const state = stateRows[0];
  const contextState = (state?.context_state || {}) as Record<string, any>;
  const riskEnvironment = String(state?.risk_environment || contextState?.riskEnvironment || '');

  const updatedAtMs = state?.updated_at ? Date.parse(String(state.updated_at)) : NaN;
  const dataAgeSeconds = Number.isFinite(updatedAtMs)
    ? Math.max(0, Math.round((Date.now() - updatedAtMs) / 1000))
    : 999;

  return {
    regime: mapRiskEnvironmentToRegime(riskEnvironment),
    dataStatus: inferDataStatus(dataAgeSeconds),
    dataAgeSeconds,
    eventSeverity: inferEventSeverity({ riskEnvironment, contextState }),
    realizedDailyR: clamp(toFinite(realizedRows[0]?.realized_daily_r, 0), -20, 20),
    openRiskR: clamp(toFinite(openRiskRows[0]?.open_risk_r, 0), 0, 20),
    consecutiveLosses: computeConsecutiveLosses(streakRows),
  };
}
