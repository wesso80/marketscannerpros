import {
  DirectionState,
  OptionsScannerPayload,
  PermissionState,
} from '@/types/optionsScanner';

function qualityFromConfidence(confidence: number): 'High' | 'Med' | 'Low' {
  if (confidence >= 75) return 'High';
  if (confidence >= 55) return 'Med';
  return 'Low';
}

function normalizePermission(state?: string): PermissionState {
  const s = String(state || '').toUpperCase();
  if (s === 'ALLOW' || s === 'GO' || s === 'ALLOWED') return 'GO';
  if (s === 'BLOCK' || s === 'BLOCKED' || s === 'NO_TRADE') return 'BLOCK';
  return 'WAIT';
}

function normalizeDirection(raw?: string): DirectionState {
  const d = String(raw || '').toLowerCase();
  if (d.includes('bull')) return 'BULLISH';
  if (d.includes('bear')) return 'BEARISH';
  return 'NEUTRAL';
}

export function mapOptionsScanResponseToV3(raw: any, symbol: string): OptionsScannerPayload | null {
  const data = raw?.data;
  if (!data) return null;

  const top = data?.universalScoringV21?.topCandidates?.[0] || null;
  const permission = normalizePermission(top?.permission?.state);
  const direction = normalizeDirection(data?.direction || top?.direction);

  const confidence = Math.max(
    1,
    Math.min(99, Math.round(Number(top?.scores?.confidence ?? data?.compositeScore?.confidence ?? 50))),
  );

  const blockers: string[] = [
    ...(top?.permission?.blockers || []),
    ...(data?.compositeScore?.conflicts || []),
  ].map((item: string) => String(item).replaceAll('_', ' '));

  const confirmations = Number(top?.diagnostics?.hardPasses ?? top?.scores?.context ? 2 : 1);
  const conflicts = Math.max(0, blockers.length);

  const entryTrigger =
    data?.tradeSnapshot?.action?.entryTrigger ||
    data?.entryTiming?.reason ||
    'Wait for cleaner trigger + liquidity confirmation';

  const stop = data?.tradeLevels?.stopLoss
    ? `${Number.isFinite(Number(data.tradeLevels.stopLoss)) ? Number(data.tradeLevels.stopLoss).toFixed(2) : '?'} (${data?.stopLossStrategy || 'structural'})`
    : 'Not available';

  const targets = [data?.tradeLevels?.target1, data?.tradeLevels?.target2, data?.tradeLevels?.target3]
    .filter(Boolean)
    .map((target: any) => `${Number.isFinite(Number(target.price)) ? Number(target.price).toFixed(2) : '?'} (${target.reason || 'target'})`);

  return {
    header: {
      symbol: String(symbol || data?.symbol || 'N/A').toUpperCase(),
      underlyingPrice: Number(data?.currentPrice || 0),
      sessionLabel: data?.entryTiming?.marketSession || 'regular',
      regime: {
        marketRegime: data?.aiMarketState?.regime?.regime || 'UNKNOWN',
        volatility: data?.ivAnalysis ? `IVR ${Math.round(Number(data.ivAnalysis.ivRankHeuristic ?? data.ivAnalysis.ivRank ?? 0))}` : 'Unknown',
        liquidity: data?.dataQuality?.freshness || 'Unknown',
      },
      feed: {
        integrity: data?.dataQuality?.freshness || 'UNKNOWN',
        latencySec: data?.dataQuality?.lastUpdated
          ? Math.max(0, Math.round((Date.now() - new Date(data.dataQuality.lastUpdated).getTime()) / 1000))
          : null,
        feedStatus: data?.dataSources?.optionsChain || 'unknown',
      },
    },
    decision: {
      permission,
      direction,
      confidence,
      quality: qualityFromConfidence(confidence),
      primaryDriver:
        (data?.tradeSnapshot?.why || [])[0] ||
        top?.rationale ||
        'Composite setup quality and market context alignment.',
      primaryBlocker: blockers[0] || (permission === 'GO' ? undefined : 'Waiting for confirmation'),
      flipTrigger: entryTrigger,
      catalystWindow: data?.entryTiming?.idealEntryWindow || 'Next active window',
      validityLabel:
        data?.dataQuality?.lastUpdated
          ? `Updated ${new Date(data.dataQuality.lastUpdated).toLocaleTimeString()}`
          : 'No timestamp',
    },
    setup: {
      setupType: data?.strategyRecommendation?.strategyType || 'multi-factor',
      timeframeAlignment: `${data?.compositeScore?.alignedCount ?? '-'} / ${data?.compositeScore?.totalSignals ?? '-'}`,
      volRegime: data?.aiMarketState?.regime?.regime || 'Unknown',
      optionsRegime: data?.dealerGamma?.regime || 'Unknown',
      invalidation: data?.entryTiming?.avoidWindows?.[0] || 'If structure breaks and confirmation fails.',
    },
    plan: {
      entry: entryTrigger,
      stop,
      targets,
      rPreview: data?.tradeLevels?.riskRewardRatio
        ? `${Number(data.tradeLevels.riskRewardRatio).toFixed(2)}R`
        : 'N/A',
      riskGovernor: data?.riskGovernorContext?.stateMachineContext?.state || 'No override',
      positionSuggestion: top?.contract?.label || data?.strategyRecommendation?.strategy || 'No contract suggestion',
    },
    evidenceSummary: {
      confirmations,
      conflicts,
      signals: Number(data?.compositeScore?.totalSignals ?? 0),
    },
    evidence: {
      structure: {
        trendStructure: `${data?.direction || 'neutral'} / ${data?.signalStrength || 'unknown'}`,
        keyLevels: [
          data?.tradeLevels?.entryZone ? `Entry zone ${Number(data.tradeLevels.entryZone.low).toFixed(2)}-${Number(data.tradeLevels.entryZone.high).toFixed(2)}` : 'Entry zone unavailable',
          data?.tradeLevels?.stopLoss ? `Stop ${Number(data.tradeLevels.stopLoss).toFixed(2)}` : 'Stop unavailable',
        ],
        state: data?.tradeQuality || 'Unknown',
      },
      optionsFlow: {
        callPutPressure: data?.openInterestAnalysis?.sentimentReason || 'Unavailable',
        oiChange: data?.openInterestAnalysis?.pcRatio ? `P/C ${Number(data.openInterestAnalysis.pcRatio).toFixed(2)}` : 'Unavailable',
        unusualActivity: data?.unusualActivity?.alertLevel || 'none',
        volumeBursts: data?.unusualActivity?.hasUnusualActivity ? 'Detected' : 'None detected',
      },
      greeksIv: {
        ivRank: data?.ivAnalysis?.ivRankHeuristic != null ? `${Math.round(Number(data.ivAnalysis.ivRankHeuristic))}` : 'N/A',
        ivPercentile: data?.ivAnalysis?.ivPercentile != null ? `${Math.round(Number(data.ivAnalysis.ivPercentile))}` : 'N/A',
        skewTerm: data?.ivAnalysis?.termStructure || 'N/A',
        greeksSummary: data?.greeksAdvice?.overallAdvice || 'N/A',
        gammaRisk: data?.dealerGamma?.regime || 'N/A',
      },
      liquidityTape: {
        magnetLevels: data?.dealerGamma?.nearSpotDominance ? 'Near-spot gamma magnet' : 'No clear magnet',
        sweepFlags: blockers.find((item) => item.toLowerCase().includes('liquidity')) || 'No sweep flags',
        volumeProfile: data?.institutionalFilter?.summary || 'No profile data',
      },
      aiNarrative: {
        summaryBullets: (data?.tradeSnapshot?.why || []).slice(0, 3),
        signalChecklist: [
          `Confluence: ${data?.compositeScore?.alignedCount ?? '-'}/${data?.compositeScore?.totalSignals ?? '-'}`,
          `Quality: ${data?.tradeQuality || 'Unknown'}`,
          `Timing: ${data?.entryTiming?.urgency || 'Unknown'}`,
        ],
      },
      riskCompliance: {
        dataIntegrity: data?.dataQuality?.freshness || 'Unknown',
        latency: (() => {
          if (!data?.dataQuality?.lastUpdated) return 'Unknown';
          const ms = Date.now() - new Date(data.dataQuality.lastUpdated).getTime();
          return Number.isFinite(ms) ? `${Math.max(0, Math.round(ms / 1000))}s` : 'Unknown';
        })(),
        whyBlocked: blockers[0] || 'No hard blocker',
      },
    },
  };
}
