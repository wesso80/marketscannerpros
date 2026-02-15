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
    const symbolGroup = String(body?.symbol_group || 'General');

    const samples = await loadEvolutionSamples(session.workspaceId, symbolGroup, 400);
    if (samples.length < 30) {
      return NextResponse.json({
        success: false,
        error: 'Not enough outcome data. Need at least 30 samples for adaptation cycle.',
      }, { status: 400 });
    }

    const output = runEvolutionCycle({
      symbolGroup,
      cadence,
      baselineWeights: BASELINE_WEIGHTS,
      armedThreshold: 0.7,
      samples,
    });

    await saveEvolutionAdjustment(session.workspaceId, cadence, output);

    return NextResponse.json({
      success: true,
      data: output,
    });
  } catch (error) {
    console.error('[evolution] POST error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Evolution cycle failed',
    }, { status: 500 });
  }
}
