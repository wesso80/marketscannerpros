"use client";

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import ContextLayer from '@/components/time/ContextLayer';
import DebugDrawer from '@/components/time/DebugDrawer';
import ExecutionLayer from '@/components/time/ExecutionLayer';
import SetupLayer from '@/components/time/SetupLayer';
import TimeControls from '@/components/time/TimeControls';
import TimeGateBar from '@/components/time/TimeGateBar';
import TimeHeaderBar from '@/components/time/TimeHeaderBar';
import TimeScannerShell from '@/components/time/TimeScannerShell';
import { computeTimeConfluenceV2 } from '@/components/time/scoring';
import { DecompositionTFRow, Direction, TimeConfluenceV2Inputs } from '@/components/time/types';

type ScanModeType = 'intraday_1h' | 'intraday_4h' | 'swing_1d';

const TF_TO_MINUTES: Record<ScanModeType, number> = {
  intraday_1h: 60,
  intraday_4h: 240,
  swing_1d: 1440,
};

const FALLBACK_INPUT: TimeConfluenceV2Inputs = {
  context: {
    symbol: 'BTCUSD',
    assetClass: 'crypto',
    primaryTfMinutes: 60,
    lookbackBars: 500,
    macroBias: 'neutral',
    htfBias: 'neutral',
    regime: 'unknown',
    volState: 'normal',
    trendStrength: 0.5,
    dataIntegrity: {
      provider: 'Alpha Vantage',
      freshnessSec: 300,
      coveragePct: 0.9,
      gapsPct: 0.05,
    },
    extremeConditions: [],
  },
  setup: {
    primaryDirection: 'neutral',
    decomposition: [],
    window: {
      status: 'UNKNOWN',
      durationHours: 0,
      timeRemainingMinutes: 0,
      strength: 0,
      clusterIntegrity: 0,
      directionConsistency: 0,
      alignmentCount: 0,
      tfCount: 1,
    },
    warnings: [],
  },
  execution: {
    closeConfirmation: 'PENDING',
    closeStrength: 0,
    entryWindowQuality: 0,
    liquidityOK: true,
    riskState: 'elevated',
    notes: ['Run scan to load live confluence data.'],
  },
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function normalizeDirection(value: unknown): Direction {
  const v = String(value || '').toLowerCase();
  if (v === 'bullish') return 'bullish';
  if (v === 'bearish') return 'bearish';
  return 'neutral';
}

function mapScanToInput(symbol: string, scanMode: ScanModeType, scan: any): TimeConfluenceV2Inputs {
  const direction = normalizeDirection(scan?.prediction?.direction);
  const decompressions = Array.isArray(scan?.decompression?.decompressions)
    ? scan.decompression.decompressions
    : [];

  const decompositionRows: DecompositionTFRow[] = decompressions.map((row: any) => {
    const closeBias: Direction =
      row?.pullDirection === 'up' ? 'bullish' : row?.pullDirection === 'down' ? 'bearish' : 'neutral';
    const strength = clamp01(Number(row?.pullStrength || 0) / 10);
    const minsToClose = Math.max(0, Number(row?.minsToClose || 0));
    const isDecompressing = !!row?.isDecompressing;
    const state = isDecompressing ? (minsToClose <= 5 ? 'confirmed' : 'forming') : 'fading';

    return {
      tfLabel: String(row?.tf || 'n/a'),
      tfMinutes: Math.max(1, Number(row?.tfMinutes || 1)),
      closeBias,
      state,
      strength,
      alignedToPrimary: direction !== 'neutral' && closeBias === direction,
      closeProximityPct: clamp01(1 - minsToClose / 240),
    };
  });

  const tfCount = Math.max(1, decompositionRows.length);
  const alignmentCount = decompositionRows.filter((row) => row.alignedToPrimary).length;
  const directionScore = Math.abs(Number(scan?.scoreBreakdown?.directionScore || 0)) / 100;
  const clusterRatio = clamp01(Number(scan?.decompression?.clusteringRatio || 0));
  const confluenceScore = clamp01(Number(scan?.candleCloseConfluence?.confluenceScore || 0) / 100);

  const warnings: TimeConfluenceV2Inputs['setup']['warnings'] = [];
  if (alignmentCount / tfCount < 0.5) warnings.push('LOW_ALIGNMENT_COUNT');
  if (clusterRatio < 0.55) warnings.push('LOW_CLUSTER_INTEGRITY');
  if (directionScore < 0.5) warnings.push('MIXED_DIRECTION');
  if (confluenceScore < 0.55) warnings.push('WEAK_CLOSE_STRENGTH');

  const specialEvents = scan?.candleCloseConfluence?.specialEvents || {};
  const extremeConditions: TimeConfluenceV2Inputs['context']['extremeConditions'] = [];
  if (specialEvents.isMonthEnd || specialEvents.isQuarterEnd || specialEvents.isYearEnd) extremeConditions.push('NEWS_RISK');
  if ((scan?.decompression?.clusteredCount || 0) >= 4) extremeConditions.push('PRICE_MAGNET');
  if (directionScore < 0.35) extremeConditions.push('HTF_CONFLICT');

  const closeNowCount = Number(scan?.candleCloseConfluence?.closingNow?.count || 0);
  const closeSoonCount = Number(scan?.candleCloseConfluence?.closingSoon?.count || 0);
  const closeConfirmation = closeNowCount >= 2 ? 'CONFIRMED' : closeSoonCount > 0 ? 'PENDING' : 'FAILED';

  const riskState: TimeConfluenceV2Inputs['execution']['riskState'] =
    directionScore >= 0.65 && clusterRatio >= 0.6 ? 'controlled' : directionScore >= 0.45 ? 'elevated' : 'high';

  return {
    context: {
      symbol,
      assetClass: symbol.includes('USD') ? 'crypto' : 'equity',
      primaryTfMinutes: TF_TO_MINUTES[scanMode],
      lookbackBars: 500,
      macroBias: normalizeDirection(scan?.decompression?.netPullDirection),
      htfBias: normalizeDirection(scan?.prediction?.direction),
      regime:
        scan?.signalStrength === 'strong'
          ? 'trend'
          : scan?.signalStrength === 'moderate'
          ? 'expansion'
          : scan?.signalStrength === 'weak'
          ? 'compression'
          : 'unknown',
      volState:
        scan?.candleCloseConfluence?.confluenceRating === 'extreme'
          ? 'extreme'
          : scan?.candleCloseConfluence?.confluenceRating === 'high'
          ? 'high'
          : 'normal',
      trendStrength: clamp01(directionScore),
      dataIntegrity: {
        provider: 'Alpha Vantage',
        freshnessSec: scan?.isLivePrice ? 60 : 600,
        coveragePct: clamp01((scan?.includedTFs?.length || 0) / 8),
        gapsPct: scan?.isLivePrice ? 0.02 : 0.08,
      },
      extremeConditions,
    },
    setup: {
      primaryDirection: direction,
      decomposition: decompositionRows,
      window: {
        status: closeNowCount > 0 || closeSoonCount > 0 ? 'ACTIVE' : 'INACTIVE',
        durationHours: Math.max(1, Math.round((Number(scan?.candleCloseConfluence?.bestEntryWindow?.endMins || 60) - Number(scan?.candleCloseConfluence?.bestEntryWindow?.startMins || 0)) / 60)),
        timeRemainingMinutes: Number(scan?.candleCloseConfluence?.bestEntryWindow?.startMins || 0),
        strength: clamp01(Number(scan?.decompression?.temporalCluster?.score || 0) / 100),
        clusterIntegrity: clusterRatio,
        directionConsistency: clamp01(directionScore),
        alignmentCount,
        tfCount,
      },
      warnings,
    },
    execution: {
      closeConfirmation,
      closeStrength: confluenceScore,
      entryWindowQuality: clamp01(
        0.6 * clusterRatio +
          0.4 * clamp01((Number(scan?.candleCloseConfluence?.closingSoon?.peakCount || 0) + closeNowCount) / 5),
      ),
      liquidityOK: (scan?.decompression?.activeCount || 0) >= 2,
      riskState,
      notes: [
        String(scan?.prediction?.reasoning || 'Live hierarchical confluence mapping.'),
        String(scan?.decompression?.reasoning || '').trim(),
      ].filter(Boolean),
    },
  };
}

export default function TimeScannerPage() {
  const searchParams = useSearchParams();
  const [symbol, setSymbol] = useState('BTCUSD');
  const [scanMode, setScanMode] = useState<ScanModeType>('intraday_1h');
  const [input, setInput] = useState<TimeConfluenceV2Inputs>(FALLBACK_INPUT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialScanDone, setInitialScanDone] = useState(false);

  const runScan = async (overrides?: { symbol?: string; scanMode?: ScanModeType }) => {
    const effectiveSymbol = (overrides?.symbol ?? symbol).trim().toUpperCase();
    const effectiveMode = overrides?.scanMode ?? scanMode;
    if (!effectiveSymbol) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/confluence-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: effectiveSymbol,
          mode: 'hierarchical',
          scanMode: effectiveMode,
        }),
      });

      const json = await response.json();
      if (!response.ok || !json?.success) {
        setError(json?.error || 'Time scan failed');
        return;
      }

      setInput(mapScanToInput(effectiveSymbol, effectiveMode, json.data));
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialScanDone || loading) return;
    setInitialScanDone(true);

    const symbolParam = (searchParams.get('symbol') || '').trim().toUpperCase();
    const tfParam = String(searchParams.get('tf') || '').trim() as ScanModeType;
    const validTf = tfParam === 'intraday_1h' || tfParam === 'intraday_4h' || tfParam === 'swing_1d';

    const initialSymbol = symbolParam || 'BTCUSD';
    const initialTf = validTf ? tfParam : 'intraday_1h';

    setSymbol(initialSymbol);
    setScanMode(initialTf);
    void runScan({ symbol: initialSymbol, scanMode: initialTf });
  }, [initialScanDone, loading, searchParams]);

  const out = computeTimeConfluenceV2(input);
  const displaySymbol = useMemo(() => input.context.symbol || symbol, [input.context.symbol, symbol]);

  return (
    <TimeScannerShell>
      <TimeHeaderBar
        symbol={displaySymbol}
        permission={out.permission}
        gateScore={out.gateScore}
        timeConfluenceScore={out.timeConfluenceScore}
        direction={out.direction}
      />

      <div className="mx-auto w-full max-w-6xl px-4 pb-10">
        <TimeControls
          symbol={symbol}
          onSymbolChange={setSymbol}
          primaryTf={scanMode}
          onPrimaryTfChange={(value) => setScanMode(value as ScanModeType)}
          onRunScan={() => {
            void runScan();
          }}
          loading={loading}
        />

        {error && (
          <div className="mt-3 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        )}

        <div className="mt-4">
          <TimeGateBar
            permission={out.permission}
            gateScore={out.gateScore}
            timeConfluenceScore={out.timeConfluenceScore}
            reasons={out.reasons}
          />
        </div>

        <div className="mt-6 space-y-6">
          <ContextLayer context={input.context} out={out} />
          <SetupLayer setup={input.setup} out={out} />
          <ExecutionLayer execution={input.execution} out={out} />
        </div>

        <div className="mt-6">
          <DebugDrawer debug={out.debug} />
        </div>
      </div>
    </TimeScannerShell>
  );
}
