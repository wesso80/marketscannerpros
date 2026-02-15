import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { getAdaptiveLayer, TraderEnvironment } from '@/lib/adaptiveTrader';
import { computeInstitutionalFilter, inferStrategyFromText, InstitutionalRegime, VolatilityState } from '@/lib/institutionalFilter';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const setupText = searchParams.get('setup') || undefined;
    const direction = (searchParams.get('direction') as 'bullish' | 'bearish' | 'neutral' | null) || undefined;
    const urgency = (searchParams.get('urgency') as 'immediate' | 'within_hour' | 'wait' | 'no_trade' | null) || undefined;
    const skill = searchParams.get('skill') || undefined;
    const timeframe = searchParams.get('timeframe') || undefined;
    const riskPercent = searchParams.get('riskPercent') ? Number(searchParams.get('riskPercent')) : undefined;
    const hasOptionsFlow = searchParams.get('hasOptionsFlow') === 'true';
    const regimeRaw = searchParams.get('regime');
    const regime: TraderEnvironment | undefined = regimeRaw === 'trend' || regimeRaw === 'range' || regimeRaw === 'reversal' || regimeRaw === 'unknown'
      ? regimeRaw
      : undefined;
    const baseSignalScore = searchParams.get('baseScore') ? Number(searchParams.get('baseScore')) : 50;

    const adaptive = await getAdaptiveLayer(
      session.workspaceId,
      {
        skill,
        setupText,
        direction,
        urgency,
        timeframe,
        riskPercent,
        hasOptionsFlow,
        regime,
      },
      Number.isFinite(baseSignalScore) ? baseSignalScore : 50
    );

    const setupTextLower = (setupText || '').toLowerCase();
    const regimeForFilter: InstitutionalRegime = regime === 'trend'
      ? 'trending'
      : regime === 'range'
        ? 'ranging'
        : regime === 'reversal'
          ? 'high_volatility_chaos'
          : 'unknown';

    const volatilityState: VolatilityState = /compression|coiled|tight/.test(setupTextLower)
      ? 'compressed'
      : /expanded|parabolic|blowoff|exhaust/.test(setupTextLower)
        ? 'expanded'
        : /extreme|shock|chaos|panic/.test(setupTextLower)
          ? 'extreme'
          : 'normal';

    const newsEventSoon = /earnings|fomc|cpi|nfp|fed|news shock|macro event/.test(setupTextLower);

    const institutionalFilter = computeInstitutionalFilter({
      baseScore: Number.isFinite(baseSignalScore) ? baseSignalScore : 50,
      strategy: inferStrategyFromText(setupText || skill || 'unknown'),
      regime: newsEventSoon ? 'news_shock' : regimeForFilter,
      liquidity: {
        session: urgency === 'no_trade' ? 'closed' : 'regular',
      },
      volatility: {
        state: volatilityState,
      },
      dataHealth: {
        freshness: 'DELAYED',
      },
      riskEnvironment: {
        stressLevel: newsEventSoon ? 'high' : 'medium',
        traderRiskDNA: adaptive.profile?.riskDNA,
      },
      newsEventSoon,
    });

    return NextResponse.json({
      success: true,
      status: adaptive.profile ? 'ready' : 'warming_up',
      profile: adaptive.profile,
      match: adaptive.match,
      institutionalFilter,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Adaptive profile API error:', error);
    return NextResponse.json({ error: 'Failed to compute adaptive profile' }, { status: 500 });
  }
}
