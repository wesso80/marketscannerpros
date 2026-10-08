import { sectionEvidenceToken } from '@/lib/ai/sectionEvidenceAccess';
import { NextRequest, NextResponse } from 'next/server';
import { optionsAnalyzer, OptionsSetup } from '@/lib/options-confluence-analyzer';
import { measuredIvRank } from '@/lib/options/ivRank';
import { ScanMode } from '@/lib/confluence-learning-agent';
import { checkOptionsAccess } from '@/lib/options/access';
import { getAdaptiveLayer } from '@/lib/adaptiveTrader';
import { computeInstitutionalFilter, inferStrategyFromText } from '@/lib/institutionalFilter';
import { computeCapitalFlowEngine } from '@/lib/capitalFlowEngine';
import { getLatestStateMachine, upsertStateMachine } from '@/lib/state-machine-store';
import { AVOptionRow, scoreOptionCandidatesV21WithDiagnostics } from '@/lib/scoring/options-v21';
import { avFetch } from '@/lib/avRateGovernor';
import { defaultChainProviders, fetchSharedOptionsChain } from '@/lib/options/chainCache';
import { buildMarketDataProviderStatus } from '@/lib/scanner/providerStatus';
import { assessOptionsChainQuality } from '@/lib/options/dataQuality';
import { isGenuineOptionsDataFallback } from '@/lib/equityDataHealth';
import { toPublicOptionsEvidence } from '@/lib/research/publicOptionsScan';

const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';

async function fetchRawOptionsRows(symbol: string, expirationDate?: string): Promise<{
  rows: AVOptionRow[];
  provider: 'REALTIME_OPTIONS_FMV' | 'REALTIME_OPTIONS' | 'HISTORICAL_OPTIONS' | 'none';
  warnings: string[];
}> {
  if (!ALPHA_VANTAGE_KEY) {
    return { rows: [], provider: 'none', warnings: ['missing_alpha_vantage_key'] };
  }

  // Shared short-TTL chain cache (opt:raw:SYM): usually already filled by the analyzer run for this scan,
  // so the strike picker no longer downloads the chain a second time.
  const shared = await fetchSharedOptionsChain<AVOptionRow>(symbol, {
    apiKey: ALPHA_VANTAGE_KEY,
    providers: defaultChainProviders(),
    fetchPayload: (fn, url) => avFetch(url, `${fn} ${symbol}`),
  });
  if (!shared) return { rows: [], provider: 'none', warnings: ['no_usable_chain'] };

  // A cache hit is not a data problem; don't let it mark the provider status as degraded.
  const warnings = shared.warnings.filter((w) => w !== 'cache_hit');
  const rows = expirationDate
    ? shared.rows.filter((row) => String(row.expiration || '') === expirationDate)
    : shared.rows;
  if (!rows.length) {
    return { rows: [], provider: 'none', warnings: [...warnings, `${shared.provider}:expiry_filter_empty`] };
  }
  return { rows, provider: shared.provider, warnings };
}

// Rate governed + Redis cached — 600 RPM premium plan

export async function POST(request: NextRequest) {
  try {
    // Paid (Pro) plan or admin required — same effective-tier rule as /api/me.
    const access = await checkOptionsAccess(request);
    if (!access.ok) {
      return access.status === 401
        ? NextResponse.json({ success: false, error: 'Please log in to use the Options Scanner' }, { status: 401 })
        : NextResponse.json({ success: false, error: 'Options Scanner requires a Pro subscription' }, { status: 403 });
    }

    const workspaceId = access.workspaceId;

    const body = await request.json();
    const { symbol, scanMode = 'intraday_1h', expirationDate } = body;
    const playbook = String(body?.playbook || 'momentum_pullback').toLowerCase().trim();
    const direction: 'long' | 'short' =
      String(body?.direction || 'long').toLowerCase() === 'short' ? 'short' : 'long';
    const timePermissionRaw = String(body?.timePermission || body?.timeScanner?.permission || 'ALLOW').toUpperCase();
    const timePermission = timePermissionRaw === 'BLOCK' ? 'BLOCK' : timePermissionRaw === 'WAIT' ? 'WAIT' : 'ALLOW';
    const timeQualityRaw = Number(body?.timeQuality ?? body?.timeScanner?.quality ?? 100);
    const timeQuality = Number.isFinite(timeQualityRaw) ? Math.max(0, Math.min(100, timeQualityRaw)) : 100;
    
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
      workspaceId,
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
        fallbackActive: isGenuineOptionsDataFallback(analysis.dataQuality),
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

    const previousState = await getLatestStateMachine(workspaceId, symbol.toUpperCase(), playbook, direction)
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
        fallbackActive: isGenuineOptionsDataFallback(analysis.dataQuality),
        lastUpdatedIso: analysis.dataQuality?.lastUpdated,
      },
      riskGovernorContext: {
        stateMachineContext,
      },
    });
    // This feed has unsigned option Greeks/OI, not dealer inventory. Never
    // alter candidate scores using an assumed dealer side or missing macro legs.

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
        workspaceId,
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
    
    const rawOptions = await fetchRawOptionsRows(symbol.toUpperCase(), expirationDate);
    const optionsChainQuality = assessOptionsChainQuality(rawOptions.rows);
    const lastUpdated = analysis.dataQuality?.lastUpdated ? Date.parse(analysis.dataQuality.lastUpdated) : Number.NaN;
    const staleSeconds = Number.isFinite(lastUpdated)
      ? Math.max(0, Math.round((Date.now() - lastUpdated) / 1000))
      : 9999;
    const tfConfluenceScore = 50; // Neutral: multi-TF is not measured for grading.
    const regimeAlignment = analysis.aiMarketState?.tradeQualityGate === 'HIGH'
      ? 0.9
      : analysis.aiMarketState?.tradeQualityGate === 'MODERATE'
        ? 0.7
        : analysis.aiMarketState?.tradeQualityGate === 'LOW'
          ? 0.5
          : 0.4;
    const macroRisk = (analysis.disclaimerFlags || []).some((flag) => /earnings|fomc|cpi|event|volatility/i.test(flag)) ? 0.35 : 0.8;

    const scoredOptionCandidatesV21 = scoreOptionCandidatesV21WithDiagnostics({
      symbol: symbol.toUpperCase(),
      timeframe: scanMode,
      spot: Number(analysis.currentPrice || 0),
      // 0-DTE (or no ATM IV) gives no selected-expiry move: pass null instead of a silent 3%; the picker then
      // uses each expiry's own ATM IV × √DTE, or skips expiries it can't size.
      expectedMovePct: Number(analysis.expectedMove?.selectedExpiryPercent) > 0 ? Number(analysis.expectedMove?.selectedExpiryPercent) : null,
      expectedMoveDte: analysis.expectedMove?.selectedExpiryDTE ?? null,
      // No IV history → null (neutral), never a fake 50.
      ivRank: measuredIvRank(analysis.ivAnalysis),
      marketDirection: analysis.direction === 'bullish' ? 'bullish' : analysis.direction === 'bearish' ? 'bearish' : 'neutral',
      marketRegimeAlignment: regimeAlignment,
      tfConfluenceScore,
      staleSeconds,
      freshness: analysis.dataQuality?.freshness || 'STALE',
      macroRisk,
      optionsRows: rawOptions.rows,
      timePermission,
      timeQuality,
      marketSession: analysis.entryTiming?.marketSession || undefined,
    });

    console.log(`✅ Options scan complete: ${symbol.toUpperCase()} - ${analysis.direction} signal, Grade: ${analysis.tradeQuality}`);
    const providerWarnings = [
      ...rawOptions.warnings,
      ...optionsChainQuality.warnings,
      ...scoredOptionCandidatesV21.diagnostics.warnings,
      ...(analysis.dataConfidenceCaps || []),
    ].filter(Boolean);
    const optionsProviderStatus = buildMarketDataProviderStatus({
      source: rawOptions.provider === 'none' ? 'none' : 'alpha_vantage',
      provider: rawOptions.provider,
      stale: analysis.dataQuality?.freshness === 'STALE' || staleSeconds > 900,
      degraded: rawOptions.provider === 'none' || optionsChainQuality.status !== 'sufficient' || providerWarnings.length > 0,
      warnings: providerWarnings,
    });
    
    // W3 (product decision 8 Oct): the response is the measured chain evidence only (lib/research/publicOptionsScan).
    // The analyzer's setup, the institutional filter, scored candidates, the capital-flow engine and the adaptive
    // profile were computed above for the server-side state machine; none of them is serialized.
    const publicEvidence=toPublicOptionsEvidence(analysis, { chainQuality: optionsChainQuality, providerWarnings: optionsProviderStatus.warnings ?? providerWarnings });
    const copilotEvidenceToken=await sectionEvidenceToken('options',analysis.symbol,analysis.assetType === 'crypto' ? 'crypto' : 'equity',publicEvidence,publicEvidence.chain.expiry);
    return NextResponse.json({
      success: true,
      ...(copilotEvidenceToken ? {copilotEvidenceToken} : {}),
      data: publicEvidence,
      dataSources: {
        underlyingPrice: analysis.assetType === 'crypto' ? 'coingecko' : 'alpha_vantage',
        optionsChain: analysis.dataQuality?.optionsChainSource || 'none',
      },
      timestamp: new Date().toISOString(),
    },{headers:{'Cache-Control':'private, no-store'}});
    
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
