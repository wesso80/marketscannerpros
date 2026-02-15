import { NextRequest, NextResponse } from 'next/server';
import { optionsAnalyzer, OptionsSetup } from '@/lib/options-confluence-analyzer';
import { ScanMode } from '@/lib/confluence-learning-agent';
import { getSessionFromCookie } from '@/lib/auth';
import { getAdaptiveLayer } from '@/lib/adaptiveTrader';
import { computeInstitutionalFilter, inferStrategyFromText } from '@/lib/institutionalFilter';
import { computeCapitalFlowEngine } from '@/lib/capitalFlowEngine';
import { getLatestStateMachine, upsertStateMachine } from '@/lib/state-machine-store';

// NOTE: In-memory cache doesn't persist across serverless invocations
// Each request fetches fresh data (75 calls/min on premium is sufficient)

export async function POST(request: NextRequest) {
  try {
    // Pro Trader tier required
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ success: false, error: 'Please log in to use the Options Scanner' }, { status: 401 });
    }
    if (session.tier !== 'pro_trader') {
      return NextResponse.json({ success: false, error: 'Pro Trader subscription required for Options Scanner' }, { status: 403 });
    }

    const body = await request.json();
    const { symbol, scanMode = 'intraday_1h', expirationDate } = body;
    const playbook = String(body?.playbook || 'momentum_pullback').toLowerCase().trim();
    const direction: 'long' | 'short' =
      String(body?.direction || 'long').toLowerCase() === 'short' ? 'short' : 'long';
    
    if (!symbol) {
      return NextResponse.json({
        success: false,
        error: 'Symbol is required',
      }, { status: 400 });
    }
    
    // Validate scan mode
    const validModes: ScanMode[] = [
      'scalping', 'intraday_30m', 'intraday_1h', 'intraday_4h',
      'swing_1d', 'swing_3d', 'swing_1w', 'macro_monthly', 'macro_yearly'
    ];
    
    if (!validModes.includes(scanMode)) {
      return NextResponse.json({
        success: false,
        error: `Invalid scan mode: ${scanMode}`,
      }, { status: 400 });
    }
    
    // Always fetch fresh data - serverless doesn't maintain state between requests
    const expiryInfo = expirationDate ? ` expiry=${expirationDate}` : ' (auto-select expiry)';
    console.log(`📊 Options scan for ${symbol.toUpperCase()} (${scanMode})${expiryInfo} at ${new Date().toISOString()}`);
    
    const analysis = await optionsAnalyzer.analyzeForOptions(symbol.toUpperCase(), scanMode, expirationDate);
    const marketRegime = analysis.aiMarketState?.regime?.regime;
    const regime = marketRegime === 'TREND'
      ? 'trend'
      : marketRegime === 'RANGE'
        ? 'range'
        : marketRegime === 'REVERSAL'
          ? 'reversal'
          : 'unknown';

    const adaptive = await getAdaptiveLayer(
      session.workspaceId,
      {
        skill: 'options',
        setupText: `${analysis.tradeSnapshot?.oneLine || ''} ${analysis.tradeQuality} ${analysis.signalStrength}`,
        direction: analysis.direction,
        urgency: analysis.entryTiming?.urgency,
        riskPercent: analysis.maxRiskPercent,
        hasOptionsFlow: !!analysis.unusualActivity?.hasUnusualActivity,
        timeframe: scanMode,
        regime,
      },
      Number(analysis.compositeScore?.confidence ?? 50)
    );

    const atrPercent = analysis.expectedMove?.selectedExpiryPercent;
    const optionsLiquidityScore = analysis.openInterestAnalysis?.highOIStrikes?.length
      ? Math.min(100, analysis.openInterestAnalysis.highOIStrikes.length * 10)
      : 35;
    const newsEventSoon = (analysis.disclaimerFlags || []).some((flag) => /earnings|fomc|cpi|news|event/i.test(flag));

    const institutionalFilter = computeInstitutionalFilter({
      baseScore: Number(analysis.compositeScore?.confidence ?? 50),
      strategy: inferStrategyFromText(`${analysis.strategyRecommendation?.strategy || ''} ${analysis.tradeSnapshot?.oneLine || ''}`),
      regime: newsEventSoon
        ? 'news_shock'
        : regime === 'trend'
          ? 'trending'
          : regime === 'range'
            ? 'ranging'
            : regime === 'reversal'
              ? 'high_volatility_chaos'
              : 'unknown',
      liquidity: {
        session: analysis.entryTiming.marketSession || 'unknown',
        optionsLiquidityScore,
      },
      volatility: {
        atrPercent,
        state: typeof atrPercent === 'number'
          ? (atrPercent > 8 ? 'extreme' : atrPercent > 5 ? 'expanded' : atrPercent < 2 ? 'compressed' : 'normal')
          : 'normal',
      },
      dataHealth: {
        freshness: analysis.dataQuality?.freshness === 'REALTIME'
          ? 'REALTIME'
          : analysis.dataQuality?.freshness === 'DELAYED'
            ? 'DELAYED'
            : analysis.dataQuality?.freshness === 'EOD'
              ? 'EOD'
              : analysis.dataQuality?.freshness === 'STALE'
                ? 'STALE'
                : 'NONE',
        fallbackActive: !!(analysis.dataConfidenceCaps && analysis.dataConfidenceCaps.length > 0),
      },
      riskEnvironment: {
        stressLevel: newsEventSoon ? 'high' : (typeof atrPercent === 'number' && atrPercent > 6 ? 'high' : 'medium'),
        traderRiskDNA: adaptive.profile?.riskDNA,
      },
      newsEventSoon,
    });

    const liquidityLevels = [
      ...(analysis.tradeLevels?.entryZone
        ? [
            { level: analysis.tradeLevels.entryZone.low, label: 'ENTRY_LOW' },
            { level: analysis.tradeLevels.entryZone.high, label: 'ENTRY_HIGH' },
          ]
        : []),
      ...(analysis.tradeLevels?.target1 ? [{ level: analysis.tradeLevels.target1.price, label: 'TARGET_1' }] : []),
      ...(analysis.tradeLevels?.target2 ? [{ level: analysis.tradeLevels.target2.price, label: 'TARGET_2' }] : []),
      ...(analysis.locationContext?.keyZones || []).map((zone) => ({
        level: zone.level,
        label: zone.type.toUpperCase(),
      })),
    ];

    const previousState = await getLatestStateMachine(session.workspaceId, symbol.toUpperCase(), playbook, direction)
      .catch((error) => {
        console.warn('[options-scan] state-machine load failed:', error);
        return null;
      });

    const stateMachineContext = {
      currentState: previousState?.state,
      previousState: previousState?.previous_state ?? undefined,
      stateSinceIso: previousState?.state_since,
      event: 'institutional_filter_update' as const,
      cooldownUntilIso: null,
      positionOpen: false,
      edgeDecay: false,
      triggerCurrent: 'waiting_confirmation',
      triggerEta: 'unknown',
      setupMissing: institutionalFilter.noTrade ? ['institutional_filter_block'] : [],
      playbook,
      direction,
    };

    const capitalFlow = computeCapitalFlowEngine({
      symbol: symbol.toUpperCase(),
      spot: analysis.currentPrice,
      atr: analysis.expectedMove?.selectedExpiry,
      openInterest: analysis.openInterestAnalysis
        ? {
            totalCallOI: analysis.openInterestAnalysis.totalCallOI,
            totalPutOI: analysis.openInterestAnalysis.totalPutOI,
            pcRatio: analysis.openInterestAnalysis.pcRatio,
            expirationDate: analysis.openInterestAnalysis.expirationDate,
            highOIStrikes: analysis.openInterestAnalysis.highOIStrikes,
          }
        : null,
      liquidityLevels,
      dataHealth: {
        freshness: analysis.dataQuality?.freshness,
        fallbackActive: !!(analysis.dataConfidenceCaps && analysis.dataConfidenceCaps.length > 0),
        lastUpdatedIso: analysis.dataQuality?.lastUpdated,
      },
      riskGovernorContext: {
        stateMachineContext,
      },
    });

    const stateMachine = capitalFlow.brain_decision_v1?.state_machine;
    if (stateMachine) {
      const transition = {
        old_state: stateMachine.previous_state,
        new_state: stateMachine.state,
        reason: stateMachine.audit.transition_reason,
        timestamp: capitalFlow.brain_decision_v1.meta.generated_at,
        changed: stateMachine.previous_state !== stateMachine.state,
      };

      await upsertStateMachine({
        workspaceId: session.workspaceId,
        symbol: symbol.toUpperCase(),
        playbook,
        direction,
        eventType: 'institutional_filter_update',
        output: {
          state_machine: stateMachine,
          transition,
        },
        brainScore: capitalFlow.brain_decision_v1.brain_score.overall,
        stateConfidence: capitalFlow.brain_decision_v1.probability_matrix.confidence,
        metadata: {
          route: '/api/options-scan',
          scanMode,
          institutionalFilterScore: institutionalFilter.finalScore,
        },
      }).catch((error) => {
        console.warn('[options-scan] state-machine persist failed:', error);
      });
    }
    
    console.log(`✅ Options scan complete: ${symbol.toUpperCase()} - ${analysis.direction} signal, Grade: ${analysis.tradeQuality}`);
    
    return NextResponse.json({
      success: true,
      data: {
        ...analysis,
        adaptiveLayer: {
          profile: adaptive.profile,
          match: adaptive.match,
        },
        institutionalFilter,
        capitalFlow,
      },
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('Options scan error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Options analysis failed',
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Options Confluence Scanner API',
    endpoints: {
      POST: {
        description: 'Analyze a symbol for options trading using Time Confluence',
        body: {
          symbol: 'string (required)',
          scanMode: 'scalping | intraday_30m | intraday_1h | intraday_4h | swing_1d | swing_3d | swing_1w | macro_monthly | macro_yearly',
          forceRefresh: 'boolean (optional)',
        },
      },
    },
  });
}
