import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import {
  buildPermissionSnapshot,
  evaluateCandidate,
  type CandidateIntent,
  type Direction,
  type StrategyTag,
} from '@/lib/risk-governor-hard';
import { getRuntimeRiskSnapshotInput } from '@/lib/risk/runtimeSnapshot';

function isDirection(value: string): value is Direction {
  return value === 'LONG' || value === 'SHORT';
}

function isStrategy(value: string): value is StrategyTag {
  return [
    'BREAKOUT_CONTINUATION',
    'TREND_PULLBACK',
    'RANGE_FADE',
    'MEAN_REVERSION',
    'MOMENTUM_REVERSAL',
    'EVENT_STRATEGY',
  ].includes(value);
}

export async function POST(req: NextRequest) {
  try {
    // Require authentication — risk evaluation must be user-scoped
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await req.json();
    const guardEnabled = req.cookies.get('msp_risk_guard')?.value !== 'off';
    const runtimeInput = await getRuntimeRiskSnapshotInput(session.workspaceId).catch(() => null);
    const input = body?.trade_intent || body;

    const strategy = String(input?.strategy_tag || '').toUpperCase();
    const direction = String(input?.direction || '').toUpperCase();

    if (!isStrategy(strategy) || !isDirection(direction)) {
      return NextResponse.json({ error: 'Invalid strategy_tag or direction' }, { status: 400 });
    }

    const candidate: CandidateIntent = {
      symbol: String(input?.symbol || '').toUpperCase(),
      asset_class: String(input?.asset_class || '').toLowerCase() === 'crypto' ? 'crypto' : 'equities',
      strategy_tag: strategy,
      direction,
      confidence: Number(input?.confidence || 0),
      entry_price: Number(input?.entry_price || 0),
      stop_price: Number(input?.stop_price || 0),
      atr: Number(input?.atr || 0),
      event_severity: ['none', 'medium', 'high'].includes(String(input?.event_severity || '').toLowerCase())
        ? String(input?.event_severity || '').toLowerCase() as 'none' | 'medium' | 'high'
        : 'none',
    };

    if (!candidate.symbol || !Number.isFinite(candidate.entry_price) || !Number.isFinite(candidate.stop_price) || !Number.isFinite(candidate.atr)) {
      return NextResponse.json({ error: 'Invalid numeric trade intent fields' }, { status: 400 });
    }

    const fallbackSnapshotInput = body?.snapshot_input || {};
    const snapshot = buildPermissionSnapshot({
      enabled: guardEnabled,
      regime: runtimeInput?.regime ?? fallbackSnapshotInput?.regime,
      dataStatus: runtimeInput?.dataStatus ?? fallbackSnapshotInput?.dataStatus,
      dataAgeSeconds: runtimeInput?.dataAgeSeconds ?? Number(fallbackSnapshotInput?.dataAgeSeconds ?? 3),
      eventSeverity: runtimeInput?.eventSeverity ?? fallbackSnapshotInput?.eventSeverity,
      realizedDailyR: runtimeInput?.realizedDailyR ?? Number(fallbackSnapshotInput?.realizedDailyR ?? -1.2),
      openRiskR: runtimeInput?.openRiskR ?? Number(fallbackSnapshotInput?.openRiskR ?? 2.2),
      consecutiveLosses: runtimeInput?.consecutiveLosses ?? Number(fallbackSnapshotInput?.consecutiveLosses ?? 1),
    });

    const evaluation = evaluateCandidate(snapshot, candidate);
    return NextResponse.json(evaluation);
  } catch (error) {
    console.error('risk governor evaluate error:', error);
    return NextResponse.json({ error: 'Failed to evaluate trade intent' }, { status: 500 });
  }
}
