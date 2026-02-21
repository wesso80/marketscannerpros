"use client";

import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import DebugDrawer from '@/components/time/DebugDrawer';
import TimeScannerShell from '@/components/time/TimeScannerShell';
import { computeTimeConfluenceV2 } from '@/components/time/scoring';
import { DecompositionTFRow, Direction, TimeConfluenceV2Inputs } from '@/components/time/types';

type ScanModeType = 'intraday_1h' | 'intraday_4h' | 'swing_1d';

const TF_TO_MINUTES: Record<ScanModeType, number> = {
  intraday_1h: 60,
  intraday_4h: 240,
  swing_1d: 1440,
};

const TIMEFRAME_OPTIONS: ScanModeType[] = ['intraday_1h', 'intraday_4h', 'swing_1d'];

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

function permissionTone(permission: 'ALLOW' | 'WAIT' | 'BLOCK') {
  if (permission === 'ALLOW') return { border: 'border-emerald-500/30', dot: 'bg-emerald-400', label: 'GO' };
  if (permission === 'WAIT') return { border: 'border-amber-500/30', dot: 'bg-amber-400', label: 'WAIT' };
  return { border: 'border-rose-500/30', dot: 'bg-rose-400', label: 'BLOCK' };
}

function riskLabel(permission: 'ALLOW' | 'WAIT' | 'BLOCK') {
  if (permission === 'BLOCK') return 'HIGH';
  if (permission === 'WAIT') return 'MOD';
  return 'LOW';
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="w-[88px] rounded-xl border border-slate-800 bg-slate-950/30 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function scoreDot(score: number) {
  if (score >= 70) return 'bg-emerald-400';
  if (score >= 45) return 'bg-amber-400';
  return 'bg-rose-400';
}

function ConfluenceRow({ label, score }: { label: string; score: number }) {
  return (
    <div className="grid grid-cols-[1.2fr_2fr_56px_20px] items-center gap-2.5">
      <div className="text-xs text-slate-300">{label}</div>
      <div className="h-2.5 w-full rounded-full bg-slate-800">
        <div className="h-2.5 rounded-full bg-slate-500" style={{ width: `${Math.max(1, Math.min(99, score))}%` }} />
      </div>
      <div className="text-right text-xs font-semibold text-slate-200">{Math.round(score)}%</div>
      <div className="flex justify-end">
        <div className={`h-2.5 w-2.5 rounded-full ${scoreDot(score)}`} />
      </div>
    </div>
  );
}

function ExecutionField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/25 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function IntelAccordionSection({ title, summary, children }: { title: string; summary: string; children: ReactNode }) {
  return (
    <details className="rounded-2xl border border-slate-800 bg-slate-900/25">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-slate-100">{title}</div>
          <div className="text-xs text-slate-400">{summary}</div>
        </div>
        <div className="h-7 w-7 rounded-lg border border-slate-700 bg-slate-950/30" />
      </summary>
      <div className="border-t border-slate-800 px-4 py-3 text-sm text-slate-200">{children}</div>
    </details>
  );
}

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
  const tone = permissionTone(out.permission);
  const rrEstimate = out.executionScore >= 70 ? '2.3' : out.executionScore >= 45 ? '1.7' : '1.2';
  const confluenceRows = [
    { label: 'Trend Alignment', score: out.contextScore },
    { label: 'Flow Strength', score: out.setupScore },
    { label: 'Close Confirmation', score: out.executionScore },
    { label: 'Cluster Integrity', score: input.setup.window.clusterIntegrity * 100 },
    { label: 'Window Quality', score: input.execution.entryWindowQuality * 100 },
  ];

  return (
    <TimeScannerShell>
      <main className="mx-auto w-full max-w-none space-y-5 px-4 py-4 lg:px-6 lg:py-6">

        {error && (
          <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        )}

        <section className={`w-full rounded-2xl border bg-slate-900/40 px-4 lg:px-6 ${tone.border}`}>
          <div className="grid min-h-[88px] grid-cols-1 items-center gap-3 py-3 lg:grid-cols-[1.3fr_0.9fr_1.2fr] lg:py-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <input
                  value={symbol}
                  onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                  placeholder="SYMBOL"
                  className="w-24 rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-1.5 text-sm font-semibold text-slate-100"
                />
                <select
                  value={scanMode}
                  onChange={(event) => setScanMode(event.target.value as ScanModeType)}
                  className="rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-1.5 text-xs text-slate-200"
                >
                  {TIMEFRAME_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    void runScan();
                  }}
                  disabled={loading}
                  className="rounded-lg border border-slate-700 bg-slate-950/50 px-2.5 py-1.5 text-xs font-semibold text-slate-100 disabled:opacity-40"
                >
                  {loading ? 'Scanning…' : 'Run'}
                </button>
              </div>
              <div className="mt-1.5 truncate text-xs text-slate-400">
                {out.direction} • {scanMode} • {displaySymbol}
              </div>
            </div>

            <div className="flex justify-start lg:justify-center">
              <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/45 px-3 py-2">
                <div className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} />
                <div className="text-sm font-semibold tracking-wide text-slate-100">{tone.label}</div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 lg:justify-end">
              <div className="grid grid-cols-3 gap-2">
                <MetricPill label="Conf" value={`${Math.round(out.timeConfluenceScore)}%`} />
                <MetricPill label="Risk" value={riskLabel(out.permission)} />
                <MetricPill label="R:R" value={rrEstimate} />
              </div>
            </div>
          </div>
        </section>

        <section className="w-full rounded-2xl border border-slate-800 bg-slate-900/30 p-3 lg:p-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr] lg:gap-6">
            <div className="space-y-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">Confluence Engine</div>
                <div className="text-xs text-slate-400">Time alignment → permission quality</div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/25 p-3">
                <div className="space-y-3">
                  {confluenceRows.map((row) => (
                    <ConfluenceRow key={row.label} label={row.label} score={row.score} />
                  ))}
                </div>
                <div className="mt-3 text-xs text-slate-500">
                  Alignment {input.setup.window.alignmentCount}/{input.setup.window.tfCount} • Window {input.setup.window.status}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">Execution</div>
                <div className="text-xs text-slate-400">Only what you need to execute timing</div>
              </div>

              <div className="rounded-2xl border border-slate-700 bg-slate-950/35 p-3 shadow-sm">
                <div className="space-y-2">
                  <ExecutionField label="Close" value={input.execution.closeConfirmation} />
                  <ExecutionField label="Risk" value={input.execution.riskState} />
                  <ExecutionField label="Liquidity" value={input.execution.liquidityOK ? 'OK' : 'THIN'} />

                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <MetricPill label="Gate" value={`${Math.round(out.gateScore)}%`} />
                    <MetricPill label="Time" value={`${Math.round(out.timeConfluenceScore)}%`} />
                    <MetricPill label="Window" value={`${Math.round(input.execution.entryWindowQuality * 100)}%`} />
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/25 px-3 py-2 text-xs text-slate-400">
                    {input.execution.notes?.[0] || 'No execution notes'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <IntelAccordionSection title="AI Signal Breakdown" summary="Why timing permission is GO / WAIT / BLOCK">
            <ul className="space-y-1.5 text-sm text-slate-200">
              {out.reasons.length === 0 ? <li>No reasons available.</li> : out.reasons.slice(0, 8).map((reason) => <li key={reason}>• {reason}</li>)}
            </ul>
          </IntelAccordionSection>

          <IntelAccordionSection title="Institutional Flow" summary="Cluster + close timing structure">
            <div>Cluster Integrity: {Math.round(input.setup.window.clusterIntegrity * 100)}%</div>
            <div>Direction Consistency: {Math.round(input.setup.window.directionConsistency * 100)}%</div>
            <div>Close Strength: {Math.round(input.execution.closeStrength * 100)}%</div>
          </IntelAccordionSection>

          <IntelAccordionSection title="Pattern Confirmation" summary="HTF/Regime context and alignment">
            <div>Macro Bias: {input.context.macroBias}</div>
            <div>HTF Bias: {input.context.htfBias}</div>
            <div>Regime: {input.context.regime}</div>
            <div>Vol State: {input.context.volState}</div>
          </IntelAccordionSection>

          <IntelAccordionSection title="Risk Warnings" summary="Timing and execution blockers">
            <div className="space-y-1.5">
              {input.setup.warnings.length === 0 ? <div>No warnings.</div> : input.setup.warnings.map((warning) => <div key={warning}>• {warning}</div>)}
            </div>
          </IntelAccordionSection>

          <IntelAccordionSection title="Narrative Context" summary="Execution notes and scanner context">
            <div className="space-y-1.5">
              {(input.execution.notes || []).length === 0 ? (
                <div>No narrative notes.</div>
              ) : (
                (input.execution.notes || []).map((note) => <div key={note}>• {note}</div>)
              )}
            </div>
          </IntelAccordionSection>

          <IntelAccordionSection title="Snapshot History" summary="Debug payload and internals">
            <DebugDrawer debug={out.debug} />
          </IntelAccordionSection>
        </section>
      </main>
    </TimeScannerShell>
  );
}
