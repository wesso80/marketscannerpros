"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import CloseCalendar from '@/components/time/CloseCalendar';
import DebugDrawer from '@/components/time/DebugDrawer';
import TimeScannerShell from '@/components/time/TimeScannerShell';
import { computeTimeConfluenceV2 } from '@/components/time/scoring';
import { DecompositionTFRow, Direction, TimeConfluenceV2Inputs } from '@/components/time/types';
import { fireAutoLog } from '@/lib/autoLog';

type ScanModeType = 'scalping' | 'intraday_30m' | 'intraday_1h' | 'intraday_4h' | 'swing_1d' | 'swing_3d' | 'swing_1w' | 'macro_monthly' | 'macro_yearly';

const TF_TO_MINUTES: Record<ScanModeType, number> = {
  scalping: 15,
  intraday_30m: 30,
  intraday_1h: 60,
  intraday_4h: 240,
  swing_1d: 1440,
  swing_3d: 4320,
  swing_1w: 10080,
  macro_monthly: 43200,
  macro_yearly: 525600,
};

const SCAN_MODE_LABELS: Record<ScanModeType, string> = {
  scalping: '⚡ Scalp 15m',
  intraday_30m: '📊 30min',
  intraday_1h: '📊 1H',
  intraday_4h: '📊 4H',
  swing_1d: '📅 Daily',
  swing_3d: '📅 3-Day',
  swing_1w: '📅 Weekly',
  macro_monthly: '🏛️ Monthly',
  macro_yearly: '🏛️ Yearly',
};

const TIMEFRAME_OPTIONS: ScanModeType[] = [
  'scalping', 'intraday_30m', 'intraday_1h', 'intraday_4h',
  'swing_1d', 'swing_3d', 'swing_1w', 'macro_monthly', 'macro_yearly',
];

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

/** Format minsToClose like TradingView: "2m" / "1h 30m" / "2d 5h" / "14d" */
function formatMinsToClose(mins: number): string {
  if (mins <= 0) return 'NOW';
  if (mins < 60) return `${Math.round(mins)}m`;
  if (mins < 1440) {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(mins / 1440);
  const h = Math.round((mins % 1440) / 60);
  if (d >= 30) {
    const mo = Math.round(d / 30);
    return mo === 1 ? '1mo' : `${mo}mo`;
  }
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

/** Pick a state-based color for the close schedule row */
function closeRowColor(mins: number): string {
  if (mins <= 5) return 'text-emerald-400';
  if (mins <= 60) return 'text-amber-400';
  if (mins <= 240) return 'text-slate-300';
  return 'text-slate-500';
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

  // ── Build decomposition rows from the FULL close table (not just decompressions) ──
  // This is the key change: we merge the close schedule (all TFs) with
  // decompression pull data (only active TFs) so the UI always sees every TF.
  const closeTable: any[] = Array.isArray(scan?.candleCloseConfluence?.closes)
    ? scan.candleCloseConfluence.closes
    : [];
  const decompressions: any[] = Array.isArray(scan?.decompression?.decompressions)
    ? scan.decompression.decompressions
    : [];

  // Index decompressions by TF label for O(1) lookup
  const decompByTf = new Map<string, any>();
  for (const row of decompressions) {
    if (row?.tf) decompByTf.set(String(row.tf), row);
  }

  // Build rows: prefer close table (has minsToClose + nextCloseAt for ALL TFs),
  // enrich with decompression data (has pullDirection, pullStrength, isDecompressing).
  const decompositionRows: DecompositionTFRow[] = closeTable.map((closeRow: any) => {
    const tfLabel = String(closeRow?.tf || 'n/a');
    const tfMinutes = Math.max(1, Number(closeRow?.tfMinutes || 1));
    const minsToClose = Math.max(0, Number(closeRow?.minsToClose || 0));
    const nextCloseAt = String(closeRow?.nextCloseAt || '');
    const decompRow = decompByTf.get(tfLabel);

    const closeBias: Direction = decompRow
      ? (decompRow.pullDirection === 'up' ? 'bullish' : decompRow.pullDirection === 'down' ? 'bearish' : 'neutral')
      : 'neutral';
    const strength = decompRow ? clamp01(Number(decompRow.pullStrength || 0) / 10) : 0;
    const isDecompressing = decompRow ? !!decompRow.isDecompressing : false;

    // ── FIX: Confirmed threshold relative to TF (2% of TF minutes, min 2m) ──
    const confirmMins = Math.max(2, Math.round(tfMinutes * 0.02));
    const state: 'forming' | 'confirmed' | 'fading' = isDecompressing
      ? (minsToClose <= confirmMins ? 'confirmed' : 'forming')
      : 'fading';

    // ── FIX: Proximity scales by the TF itself (not hardcoded / 240) ──
    // Use 3× the TF duration as the proximity denominator, capped at 7 days
    const proximityDenom = Math.max(30, Math.min(3 * tfMinutes, 7 * 1440));
    const closeProximityPct = clamp01(1 - minsToClose / proximityDenom);

    return {
      tfLabel,
      tfMinutes,
      closeBias,
      state,
      strength,
      alignedToPrimary: direction !== 'neutral' && closeBias === direction,
      closeProximityPct,
      nextCloseAt: nextCloseAt || undefined,
      minsToClose,
      mid50Level: decompRow ? Number(decompRow.mid50Level || 0) : undefined,
      distanceToMid50: decompRow ? Number(decompRow.distanceToMid50 || 0) : undefined,
      pullDirection: decompRow?.pullDirection || undefined,
    };
  });

  // If close table was empty (legacy API response), fall back to decompressions only
  if (decompositionRows.length === 0) {
    for (const row of decompressions) {
      const tfMinutes = Math.max(1, Number(row?.tfMinutes || 1));
      const minsToClose = Math.max(0, Number(row?.minsToClose || 0));
      const closeBias: Direction =
        row?.pullDirection === 'up' ? 'bullish' : row?.pullDirection === 'down' ? 'bearish' : 'neutral';
      const strength = clamp01(Number(row?.pullStrength || 0) / 10);
      const isDecompressing = !!row?.isDecompressing;
      const confirmMins = Math.max(2, Math.round(tfMinutes * 0.02));
      const state: 'forming' | 'confirmed' | 'fading' = isDecompressing
        ? (minsToClose <= confirmMins ? 'confirmed' : 'forming')
        : 'fading';
      const proximityDenom = Math.max(30, Math.min(3 * tfMinutes, 7 * 1440));

      decompositionRows.push({
        tfLabel: String(row?.tf || 'n/a'),
        tfMinutes,
        closeBias,
        state,
        strength,
        alignedToPrimary: direction !== 'neutral' && closeBias === direction,
        closeProximityPct: clamp01(1 - minsToClose / proximityDenom),
        minsToClose,
        mid50Level: Number(row?.mid50Level || 0) || undefined,
        distanceToMid50: Number(row?.distanceToMid50 || 0) || undefined,
        pullDirection: row?.pullDirection || undefined,
      });
    }
  }

  const tfCount = Math.max(1, decompositionRows.length);
  const alignmentCount = decompositionRows.filter((row) => row.alignedToPrimary).length;
  const directionScore = Math.abs(Number(scan?.scoreBreakdown?.directionScore || 0)) / 100;
  const clusterRatio = clamp01(Number(scan?.decompression?.clusteringRatio || 0));
  const confluenceScore = clamp01(Number(scan?.candleCloseConfluence?.confluenceScore || 0) / 100);

  // ── Use peakCloseCluster for improved cluster metrics ──
  const peakCluster = scan?.candleCloseConfluence?.peakCloseCluster;
  const peakClusterCount = Number(peakCluster?.count || 0);
  const peakClusterWeight = Number(peakCluster?.weightedScore || 0);

  const warnings: TimeConfluenceV2Inputs['setup']['warnings'] = [];
  if (alignmentCount / tfCount < 0.5) warnings.push('LOW_ALIGNMENT_COUNT');
  if (clusterRatio < 0.55 && peakClusterCount < 3) warnings.push('LOW_CLUSTER_INTEGRITY');
  if (directionScore < 0.5) warnings.push('MIXED_DIRECTION');
  if (confluenceScore < 0.55) warnings.push('WEAK_CLOSE_STRENGTH');

  const specialEvents = scan?.candleCloseConfluence?.specialEvents || {};
  const extremeConditions: TimeConfluenceV2Inputs['context']['extremeConditions'] = [];
  if (specialEvents.isMonthEnd || specialEvents.isQuarterEnd || specialEvents.isYearEnd) extremeConditions.push('NEWS_RISK');
  if ((scan?.decompression?.clusteredCount || 0) >= 4 || peakClusterCount >= 5) extremeConditions.push('PRICE_MAGNET');
  if (directionScore < 0.35) extremeConditions.push('HTF_CONFLICT');

  const closeNowCount = Number(scan?.candleCloseConfluence?.closingNow?.count || 0);
  const closeSoonCount = Number(scan?.candleCloseConfluence?.closingSoon?.count || 0);
  const closeConfirmation = closeNowCount >= 2 ? 'CONFIRMED' : closeSoonCount > 0 ? 'PENDING' : 'FAILED';

  const riskState: TimeConfluenceV2Inputs['execution']['riskState'] =
    directionScore >= 0.65 && clusterRatio >= 0.6 ? 'controlled' : directionScore >= 0.45 ? 'elevated' : 'high';

  // Improved cluster integrity: blend decompression clusterRatio with peak cluster score
  const blendedClusterIntegrity = clamp01(
    0.5 * clusterRatio + 0.5 * clamp01(peakClusterWeight / 50)
  );

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
        status: closeNowCount > 0 || closeSoonCount > 0 || peakClusterCount >= 3 ? 'ACTIVE' : 'INACTIVE',
        durationHours: Math.max(1, Math.round((Number(scan?.candleCloseConfluence?.bestEntryWindow?.endMins || 60) - Number(scan?.candleCloseConfluence?.bestEntryWindow?.startMins || 0)) / 60)),
        timeRemainingMinutes: Number(scan?.candleCloseConfluence?.bestEntryWindow?.startMins || 0),
        strength: clamp01(Math.max(
          Number(scan?.decompression?.temporalCluster?.score || 0) / 100,
          peakClusterWeight / 100,
        )),
        clusterIntegrity: blendedClusterIntegrity,
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
  const [isMarketOpen, setIsMarketOpen] = useState<boolean>(true);
  const timeAutoLogRef = useRef<string>('');

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

      const mapped = mapScanToInput(effectiveSymbol, effectiveMode, json.data);
      setInput(mapped);
      setIsMarketOpen(json.data?.candleCloseConfluence?.isMarketOpen !== false);

      // ── Auto-log to execution engine (paper trade) ──
      const tOut = computeTimeConfluenceV2(mapped);
      const dir = mapped.setup.primaryDirection;
      if (tOut.permission === 'ALLOW' && dir !== 'neutral' && tOut.timeConfluenceScore >= 60) {
        const key = `${effectiveSymbol}:${dir}:${Math.round(tOut.timeConfluenceScore)}`;
        if (timeAutoLogRef.current !== key) {
          timeAutoLogRef.current = key;
          const isCrypto = effectiveSymbol.includes('BTC') || effectiveSymbol.includes('ETH') || effectiveSymbol.includes('SOL') || effectiveSymbol.endsWith('USD');
          fireAutoLog({
            symbol: effectiveSymbol,
            conditionType: 'time_scanner',
            conditionMet: `${dir.toUpperCase()}_SCORE_${Math.round(tOut.timeConfluenceScore)}`,
            triggerPrice: json.data?.currentPrice || json.data?.price || 0,
            source: 'time_scanner',
            assetClass: isCrypto ? 'crypto' : 'equity',
            atr: json.data?.indicators?.atr ?? null,
          }).catch(() => {});
        }
      }
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
    const validTf = TIMEFRAME_OPTIONS.includes(tfParam);

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
                    <option key={option} value={option}>{SCAN_MODE_LABELS[option]}</option>
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
                {out.direction} • {SCAN_MODE_LABELS[scanMode]} • {displaySymbol}
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

        {/* ═══ ROW 2: CLOSE CALENDAR (Forward Schedule) ═══ */}
        <CloseCalendar />

        {/* ═══ ROW 3: CONFLUENCE ENGINE + EXECUTION (collapsible) ═══ */}
        <details className="w-full rounded-2xl border border-slate-800 bg-slate-900/30" open>
          <summary className="cursor-pointer list-none px-3 py-3 lg:px-5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-semibold text-slate-100">⏱ Time Confluence Engine</span>
                <span className="ml-2 text-xs text-slate-400">Permission score, decompression & execution</span>
              </div>
              <div className="text-xs text-slate-500">▾ expand</div>
            </div>
          </summary>
          <div className="border-t border-slate-800 p-3 lg:p-5">
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
          </div>
        </details>

        {/* ── Close Schedule (TradingView-style full TF universe) ── */}
        <section className="w-full rounded-2xl border border-slate-800 bg-slate-900/30 p-3 lg:p-5">
          <div className="mb-3">
            <div className="text-sm font-semibold text-slate-100">📊 Close Schedule — All Timeframes</div>
            <div className="text-xs text-slate-400">
              Next bar close for every TF • Prior bar 50% levels • Where price is being pulled
            </div>
          </div>

          {/* ── Market Closed Banner (equities only) ── */}
          {!isMarketOpen && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
              <span className="text-base">🔒</span>
              <div>
                <div className="text-xs font-semibold text-amber-400">MARKET CLOSED</div>
                <div className="text-[10px] text-amber-400/70">
                  US equity markets are closed — close times shown are for the next trading session (Mon–Fri 9:30 AM – 4:00 PM ET)
                </div>
              </div>
            </div>
          )}

          {/* ── Price Pull Prediction ── */}
          {(() => {
            const rowsWithMid50 = input.setup.decomposition.filter(r => r.mid50Level && r.mid50Level > 0);
            const activeDecomps = rowsWithMid50.filter(r => r.state === 'forming' || r.state === 'confirmed');
            const pullingUp = activeDecomps.filter(r => r.pullDirection === 'up');
            const pullingDown = activeDecomps.filter(r => r.pullDirection === 'down');
            const totalPull = pullingUp.length + pullingDown.length;
            const netBias = totalPull > 0 ? (pullingUp.length - pullingDown.length) / totalPull : 0;
            const biasLabel = netBias > 0.2 ? 'BULLISH' : netBias < -0.2 ? 'BEARISH' : 'NEUTRAL';
            const biasColor = netBias > 0.2 ? 'text-emerald-400' : netBias < -0.2 ? 'text-rose-400' : 'text-slate-400';
            const biasBg = netBias > 0.2 ? 'bg-emerald-500/10 border-emerald-500/30' : netBias < -0.2 ? 'bg-rose-500/10 border-rose-500/30' : 'bg-slate-800/50 border-slate-700';

            // Find strongest pull levels (closest to current price)
            const sorted = [...rowsWithMid50]
              .sort((a, b) => Math.abs(a.distanceToMid50 || 99) - Math.abs(b.distanceToMid50 || 99))
              .slice(0, 3);

            if (rowsWithMid50.length === 0) return null;

            return (
              <div className={`mb-4 rounded-xl border ${biasBg} p-3`}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-300">🧲 50% Pull Prediction</span>
                    <span className={`rounded px-2 py-0.5 text-xs font-bold ${biasColor} ${netBias > 0.2 ? 'bg-emerald-500/20' : netBias < -0.2 ? 'bg-rose-500/20' : 'bg-slate-700'}`}>
                      {biasLabel}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {pullingUp.length} TFs pulling ↑ • {pullingDown.length} TFs pulling ↓ • {activeDecomps.length} active
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {sorted.map(r => {
                    const dist = r.distanceToMid50 ?? 0;
                    const arrow = dist > 0 ? '↑' : dist < 0 ? '↓' : '→';
                    const dColor = dist > 0 ? 'text-emerald-400' : dist < 0 ? 'text-rose-400' : 'text-slate-400';
                    return (
                      <div key={r.tfLabel} className="rounded-lg border border-slate-700 bg-slate-950/40 px-2.5 py-1.5">
                        <div className="text-[10px] font-semibold text-slate-300">{r.tfLabel}</div>
                        <div className="font-mono text-xs text-slate-100">${r.mid50Level?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <div className={`text-[10px] font-mono ${dColor}`}>{arrow} {Math.abs(dist).toFixed(2)}%</div>
                      </div>
                    );
                  })}
                </div>
                {sorted.length > 0 && (
                  <div className="mt-2 text-[10px] text-slate-500">
                    Nearest magnet: <span className="font-semibold text-slate-300">{sorted[0].tfLabel} @ ${sorted[0].mid50Level?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    {' '}({Math.abs(sorted[0].distanceToMid50 ?? 0).toFixed(2)}% away)
                    {biasLabel !== 'NEUTRAL' && (
                      <span className={biasColor}> — Price likely heading {netBias > 0 ? 'UP' : 'DOWN'} toward stacked 50% levels</span>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Close table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="pb-2 pr-3 font-medium">TF</th>
                  <th className="pb-2 pr-3 font-medium">Next Close</th>
                  <th className="pb-2 pr-3 font-medium">Mins</th>
                  <th className="pb-2 pr-3 font-medium">Prev 50%</th>
                  <th className="pb-2 pr-3 font-medium">Dist %</th>
                  <th className="pb-2 pr-3 font-medium">Pull</th>
                  <th className="pb-2 pr-3 font-medium">State</th>
                  <th className="pb-2 font-medium">Wt</th>
                </tr>
              </thead>
              <tbody>
                {input.setup.decomposition.slice(0, 33).map((row) => {
                  const mins = row.minsToClose ?? 0;
                  const dist = row.distanceToMid50 ?? 0;
                  const isClosingNow = mins <= 5;
                  const isClosingSoon = mins > 5 && mins <= 60;
                  const distColor = dist > 0 ? 'text-emerald-400' : dist < 0 ? 'text-rose-400' : 'text-slate-500';
                  const pullArrow = row.pullDirection === 'up' ? '▲' : row.pullDirection === 'down' ? '▼' : '—';
                  const pullColor = row.pullDirection === 'up' ? 'text-emerald-400' : row.pullDirection === 'down' ? 'text-rose-400' : 'text-slate-600';
                  return (
                    <tr
                      key={row.tfLabel}
                      className={`border-b border-slate-800/50 ${isClosingNow ? 'bg-emerald-500/10' : isClosingSoon ? 'bg-amber-500/5' : ''}`}
                    >
                      <td className="py-1.5 pr-3 font-semibold text-slate-100">{row.tfLabel}</td>
                      <td className={`py-1.5 pr-3 font-mono ${closeRowColor(mins)}`}>{formatMinsToClose(mins)}</td>
                      <td className="py-1.5 pr-3 font-mono text-slate-400">{mins > 0 ? Math.round(mins) : '—'}</td>
                      <td className="py-1.5 pr-3 font-mono text-slate-200">
                        {row.mid50Level && row.mid50Level > 0
                          ? `$${row.mid50Level.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : <span className="text-slate-600">—</span>
                        }
                      </td>
                      <td className={`py-1.5 pr-3 font-mono ${distColor}`}>
                        {row.mid50Level && row.mid50Level > 0
                          ? `${dist >= 0 ? '+' : ''}${dist.toFixed(2)}%`
                          : <span className="text-slate-600">—</span>
                        }
                      </td>
                      <td className={`py-1.5 pr-3 font-semibold ${pullColor}`}>{pullArrow}</td>
                      <td className="py-1.5 pr-3">
                        {row.state === 'confirmed' ? (
                          <span className="inline-block rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">CONFIRMED</span>
                        ) : row.state === 'forming' ? (
                          <span className="inline-block rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">FORMING</span>
                        ) : (
                          <span className="inline-block rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">—</span>
                        )}
                      </td>
                      <td className="py-1.5 text-slate-500">{row.closeProximityPct ? `${Math.round(row.closeProximityPct * 100)}%` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {input.setup.decomposition.length === 0 && (
            <div className="py-6 text-center text-xs text-slate-500">Run a scan to load the close schedule.</div>
          )}
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
