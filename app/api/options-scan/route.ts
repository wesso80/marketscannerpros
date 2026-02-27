import { NextRequest, NextResponse } from 'next/server';
import { optionsAnalyzer, OptionsSetup } from '@/lib/options-confluence-analyzer';
import { ScanMode } from '@/lib/confluence-learning-agent';
import { getSessionFromCookie } from '@/lib/auth';
import { getAdaptiveLayer } from '@/lib/adaptiveTrader';
import { computeInstitutionalFilter, inferStrategyFromText } from '@/lib/institutionalFilter';
import { computeCapitalFlowEngine } from '@/lib/capitalFlowEngine';
import { getLatestStateMachine, upsertStateMachine } from '@/lib/state-machine-store';
import { hasProTraderAccess } from '@/lib/proTraderAccess';
import { buildDealerIntelligence, calculateDealerGammaSnapshot } from '@/lib/options-gex';
import { AVOptionRow, scoreOptionCandidatesV21 } from '@/lib/scoring/options-v21';
import { avFetch } from '@/lib/avRateGovernor';
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/redis';

const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';
const AV_OPTIONS_REALTIME_ENABLED = (process.env.AV_OPTIONS_REALTIME_ENABLED ?? 'true').toLowerCase() !== 'false';

async function fetchRawOptionsRows(symbol: string, expirationDate?: string): Promise<{
  rows: AVOptionRow[];
  provider: 'REALTIME_OPTIONS_FMV' | 'HISTORICAL_OPTIONS' | 'none';
  warnings: string[];
}> {
  if (!ALPHA_VANTAGE_KEY) {
    return { rows: [], provider: 'none', warnings: ['missing_alpha_vantage_key'] };
  }

  // Check Redis cache first (saves AV calls for repeat views)
  const cacheKey = CACHE_KEYS.optionsChain(symbol);
  const cached = await getCached<{ rows: AVOptionRow[]; provider: string }>(cacheKey);
  if (cached && Array.isArray(cached.rows) && cached.rows.length > 0) {
    const rows = expirationDate
      ? cached.rows.filter((row) => String(row.expiration || '') === expirationDate)
      : cached.rows;
    if (rows.length > 0) {
      console.log(`[options-scan] ${symbol} served from Redis cache (${rows.length} rows)`);
      return { rows, provider: cached.provider as any, warnings: ['cache_hit'] };
    }
  }

  // REALTIME_OPTIONS_FMV (FMV) is primary with 600 RPM plan
  const providers = AV_OPTIONS_REALTIME_ENABLED
    ? ['REALTIME_OPTIONS_FMV', 'HISTORICAL_OPTIONS']
    : ['HISTORICAL_OPTIONS'];

  const warnings: string[] = [];
  for (const fn of providers) {
    const url = `https://www.alphavantage.co/query?function=${fn}&symbol=${encodeURIComponent(symbol)}&apikey=${ALPHA_VANTAGE_KEY}`;
    const payload = await avFetch(url, `${fn} ${symbol}`);

    if (!payload) {
      warnings.push(`${fn}:fetch_failed`);
      continue;
    }

    const data = Array.isArray(payload?.data) ? payload.data as AVOptionRow[] : [];
    if (!data.length) {
      warnings.push(`${fn}:empty_data`);
      continue;
    }

    // Cache the full chain for subsequent requests
    await setCached(cacheKey, { rows: data, provider: fn }, CACHE_TTL.optionsChain).catch(() => {});

    const rows = expirationDate
      ? data.filter((row) => String(row.expiration || '') === expirationDate)
      : data;

    if (!rows.length) {
      warnings.push(`${fn}:expiry_filter_empty`);
      continue;
    }

    return {
      rows,
      provider: fn as 'REALTIME_OPTIONS_FMV' | 'HISTORICAL_OPTIONS',
      warnings,
    };
  }

  return { rows: [], provider: 'none', warnings };
}

// Rate governed + Redis cached — 600 RPM premium plan

export async function POST(request: NextRequest) {
  try {
    // Pro Trader tier required
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ success: false, error: 'Please log in to use the Options Scanner' }, { status: 401 });
    }
    if (!hasProTraderAccess(session.tier)) {
      return NextResponse.json({ success: false, error: 'Pro Trader subscription required for Options Scanner' }, { status: 403 });
    }

    const workspaceId = session.workspaceId;

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
        fallbackActive: !!(analysis.dataConfidenceCaps && analysis.dataConfidenceCaps.length > 0),
        lastUpdatedIso: analysis.dataQuality?.lastUpdated,
      },
      riskGovernorContext: {
        stateMachineContext,
      },
    });
    const dealerGamma = calculateDealerGammaSnapshot(analysis.openInterestAnalysis, analysis.currentPrice);
    const baseScore = Number(analysis.compositeScore?.confidence ?? 50);
    const dealerIntelligence = buildDealerIntelligence({
      snapshot: dealerGamma,
      currentPrice: analysis.currentPrice,
      baseScore,
      setupDescriptor: `${analysis.strategyRecommendation?.strategy || ''} ${analysis.tradeSnapshot?.oneLine || ''}`,
      direction: analysis.direction,
    });

    if (analysis.compositeScore) {
      analysis.compositeScore.confidence = dealerIntelligence.adjustedScore;
    }

    if (dealerIntelligence.setupScoreMultiplier !== 1) {
      analysis.qualityReasons = [
        ...(analysis.qualityReasons || []),
        `Dealer positioning adjusted setup score (${dealerIntelligence.setupScoreMultiplier.toFixed(2)}x)`,
      ];
    }

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
    const lastUpdated = analysis.dataQuality?.lastUpdated ? Date.parse(analysis.dataQuality.lastUpdated) : Number.NaN;
    const staleSeconds = Number.isFinite(lastUpdated)
      ? Math.max(0, Math.round((Date.now() - lastUpdated) / 1000))
      : 9999;
    const tfConfluenceScoreRaw = Number(analysis.compositeScore?.alignedWeightPct ?? analysis.compositeScore?.confidence ?? 50);
    const tfConfluenceScore = Number.isFinite(tfConfluenceScoreRaw) ? Math.max(0, Math.min(100, tfConfluenceScoreRaw)) : 50;
    const regimeAlignment = analysis.aiMarketState?.tradeQualityGate === 'HIGH'
      ? 0.9
      : analysis.aiMarketState?.tradeQualityGate === 'MODERATE'
        ? 0.7
        : analysis.aiMarketState?.tradeQualityGate === 'LOW'
          ? 0.5
          : 0.4;
    const macroRisk = (analysis.disclaimerFlags || []).some((flag) => /earnings|fomc|cpi|event|volatility/i.test(flag)) ? 0.35 : 0.8;

    const scoredOptionCandidatesV21 = scoreOptionCandidatesV21({
      symbol: symbol.toUpperCase(),
      timeframe: scanMode,
      spot: Number(analysis.currentPrice || 0),
      expectedMovePct: Number(analysis.expectedMove?.selectedExpiryPercent || 3),
      ivRank: Number(analysis.ivAnalysis?.ivRank ?? analysis.ivAnalysis?.ivRankHeuristic ?? 50),
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
        dealerGamma,
        dealerIntelligence,
        universalScoringV21: {
          version: 'msp.score.v2.1',
          mode: 'options_scanner',
          timeGate: {
            permission: timePermission,
            quality: timeQuality,
          },
          topCandidates: scoredOptionCandidatesV21.slice(0, 12),
          diagnostics: {
            optionsProvider: rawOptions.provider,
            warnings: rawOptions.warnings,
            staleSeconds,
            tfConfluenceScore,
          },
        },
      },
      dataSources: {
        underlyingPrice: analysis.assetType === 'crypto' ? 'coingecko' : 'alpha_vantage',
        optionsChain: analysis.dataQuality?.optionsChainSource || 'none',
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
