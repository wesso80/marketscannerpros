import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { runEvolutionCycle } from '@/lib/evolution-engine';
import {
  getLatestEvolutionAdjustments,
  loadEvolutionSamples,
  saveEvolutionAdjustment,
} from '@/lib/evolution-store';

const BASELINE_WEIGHTS = {
  regimeFit: 0.25,
  capitalFlow: 0.2,
  structureQuality: 0.2,
  optionsAlignment: 0.15,
  timing: 0.1,
  dataHealth: 0.1,
};

function isMarketLiveNY(date: Date = new Date()): boolean {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const weekday = parts.find((part) => part.type === 'weekday')?.value || 'Mon';
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || '0');
  const dow = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[weekday] ?? 1;
  const decimal = hour + minute / 60;
  return dow >= 1 && dow <= 5 && decimal >= 9.5 && decimal < 16;
}

function getBaselineFromLatest(latest: any | null): {
  weights: typeof BASELINE_WEIGHTS;
  armedThreshold: number;
} {
  const weights = latest?.adjustments_json?.weights;
  const armedThreshold = latest?.adjustments_json?.thresholds?.armedThreshold;

  const safeWeights = {
    regimeFit: Number.isFinite(Number(weights?.regimeFit)) ? Number(weights.regimeFit) : BASELINE_WEIGHTS.regimeFit,
    capitalFlow: Number.isFinite(Number(weights?.capitalFlow)) ? Number(weights.capitalFlow) : BASELINE_WEIGHTS.capitalFlow,
    structureQuality: Number.isFinite(Number(weights?.structureQuality)) ? Number(weights.structureQuality) : BASELINE_WEIGHTS.structureQuality,
    optionsAlignment: Number.isFinite(Number(weights?.optionsAlignment)) ? Number(weights.optionsAlignment) : BASELINE_WEIGHTS.optionsAlignment,
    timing: Number.isFinite(Number(weights?.timing)) ? Number(weights.timing) : BASELINE_WEIGHTS.timing,
    dataHealth: Number.isFinite(Number(weights?.dataHealth)) ? Number(weights.dataHealth) : BASELINE_WEIGHTS.dataHealth,
  };

  return {
    weights: safeWeights,
    armedThreshold: Number.isFinite(Number(armedThreshold)) ? Number(armedThreshold) : 0.7,
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const limit = Number(url.searchParams.get('limit') || 10);

    const rows = await getLatestEvolutionAdjustments(session.workspaceId, limit);

    return NextResponse.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error('[evolution] GET error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load evolution status',
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (session.tier !== 'pro_trader') {
      return NextResponse.json({ success: false, error: 'Pro Trader subscription required' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const cadence = (body?.cadence || 'daily') as 'daily' | 'weekly' | 'monthly';
    if (!['daily', 'weekly', 'monthly'].includes(cadence)) {
      return NextResponse.json({ success: false, error: 'Invalid cadence. Use daily, weekly, or monthly.' }, { status: 400 });
    }
    const symbolGroup = String(body?.symbol_group || 'General');
    const marketLive = isMarketLiveNY();

    const samples = await loadEvolutionSamples(session.workspaceId, symbolGroup, 400);
    if (samples.length < 30) {
      return NextResponse.json({
        success: false,
        error: 'Not enough outcome data. Need at least 30 samples for adaptation cycle.',
      }, { status: 400 });
    }

    const latest = (await getLatestEvolutionAdjustments(session.workspaceId, 1))[0] || null;
    const baseline = getBaselineFromLatest(latest);

    const output = runEvolutionCycle({
      symbolGroup,
      cadence,
      baselineWeights: baseline.weights,
      armedThreshold: baseline.armedThreshold,
      samples,
    });

    const passiveOnly = marketLive;
    if (!passiveOnly) {
      await saveEvolutionAdjustment(session.workspaceId, cadence, output);
    }

    return NextResponse.json({
      success: true,
      data: output,
      applied: !passiveOnly,
      mode: passiveOnly ? 'passive_learning_only' : 'adjustments_applied',
      message: passiveOnly
        ? 'Market is live: adaptation ran in passive mode. Adjustments are queued for post-session application.'
        : 'Evolution cycle applied and saved.',
    });
  } catch (error) {
    console.error('[evolution] POST error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Evolution cycle failed',
    }, { status: 500 });
  }
}
