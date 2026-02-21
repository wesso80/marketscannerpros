import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { buildPermissionSnapshot, type Regime } from '@/lib/risk-governor-hard';
import { getRuntimeRiskSnapshotInput } from '@/lib/risk/runtimeSnapshot';

function toNumber(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toRegime(value: string | null): Regime | undefined {
  const normalized = String(value || '').trim().toUpperCase();
  const allowed: Regime[] = [
    'TREND_UP',
    'TREND_DOWN',
    'RANGE_NEUTRAL',
    'VOL_EXPANSION',
    'VOL_CONTRACTION',
    'RISK_OFF_STRESS',
  ];
  return allowed.includes(normalized as Regime) ? (normalized as Regime) : undefined;
}

function toDataStatus(value: string | null): 'OK' | 'DEGRADED' | 'DOWN' | undefined {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'OK' || normalized === 'DEGRADED' || normalized === 'DOWN') {
    return normalized;
  }
  return undefined;
}

function toEventSeverity(value: string | null): 'none' | 'medium' | 'high' | undefined {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'none' || normalized === 'medium' || normalized === 'high') {
    return normalized;
  }
  return undefined;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const guardEnabled = req.cookies.get('msp_risk_guard')?.value !== 'off';
    const session = await getSessionFromCookie();

    const runtimeInput = session?.workspaceId
      ? await getRuntimeRiskSnapshotInput(session.workspaceId).catch(() => null)
      : null;

    const snapshot = buildPermissionSnapshot({
      enabled: guardEnabled,
      regime: runtimeInput?.regime ?? toRegime(url.searchParams.get('regime')),
      dataStatus: runtimeInput?.dataStatus ?? toDataStatus(url.searchParams.get('dataStatus')),
      dataAgeSeconds: runtimeInput?.dataAgeSeconds ?? toNumber(url.searchParams.get('dataAgeSeconds'), 3),
      eventSeverity: runtimeInput?.eventSeverity ?? toEventSeverity(url.searchParams.get('eventSeverity')),
      realizedDailyR: runtimeInput?.realizedDailyR ?? toNumber(url.searchParams.get('realizedDailyR'), -1.2),
      openRiskR: runtimeInput?.openRiskR ?? toNumber(url.searchParams.get('openRiskR'), 2.2),
      consecutiveLosses: runtimeInput?.consecutiveLosses ?? toNumber(url.searchParams.get('consecutiveLosses'), 1),
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    console.error('permission-snapshot error:', error);
    return NextResponse.json({ error: 'Failed to build permission snapshot' }, { status: 500 });
  }
}
