import { NextRequest, NextResponse } from 'next/server';
import {
  buildPermissionSnapshot,
  evaluateCandidate,
  type CandidateIntent,
  type Direction,
  type StrategyTag,
} from '@/lib/risk-governor-hard';

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
    const body = await req.json();
    const guardEnabled = req.cookies.get('msp_risk_guard')?.value !== 'off';
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

    const snapshot = buildPermissionSnapshot({
      enabled: guardEnabled,
      regime: body?.snapshot_input?.regime,
      dataStatus: body?.snapshot_input?.dataStatus,
      dataAgeSeconds: Number(body?.snapshot_input?.dataAgeSeconds ?? 3),
      eventSeverity: body?.snapshot_input?.eventSeverity,
      realizedDailyR: Number(body?.snapshot_input?.realizedDailyR ?? -1.2),
      openRiskR: Number(body?.snapshot_input?.openRiskR ?? 2.2),
      consecutiveLosses: Number(body?.snapshot_input?.consecutiveLosses ?? 1),
    });

    const evaluation = evaluateCandidate(snapshot, candidate);
    return NextResponse.json(evaluation);
  } catch (error) {
    console.error('risk governor evaluate error:', error);
    return NextResponse.json({ error: 'Failed to evaluate trade intent' }, { status: 500 });
  }
}
