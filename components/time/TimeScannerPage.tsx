"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import CloseCalendar from '@/components/time/CloseCalendar';
import DebugDrawer from '@/components/time/DebugDrawer';
import TimeScannerShell from '@/components/time/TimeScannerShell';
import { computeTimeConfluenceV2 } from '@/components/time/scoring';
import { DecompositionTFRow, Direction, TimeConfluenceV2Inputs } from '@/components/time/types';
import { fireAutoLog } from '@/lib/autoLog';
import { formatPrice } from '@/lib/formatPrice';
import TimeGravityMapWidget from '@/components/TimeGravityMapWidget';
import MarketPressureWidget from '@/components/MarketPressureWidget';
import { detectAssetClass } from '@/lib/detectAssetClass';
import { useUserTier, canAccessTimeScanner } from '@/lib/useUserTier';
import UpgradeGate from '@/components/UpgradeGate';

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
  if (permission === 'ALLOW') return { border: 'border-emerald-500/30', dot: 'bg-emerald-400', label: 'ALIGNED' };
  if (permission === 'WAIT') return { border: 'border-amber-500/30', dot: 'bg-amber-400', label: 'CONDITIONAL' };
  return { border: 'border-rose-500/30', dot: 'bg-rose-400', label: 'NOT ALIGNED' };
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
      mid50Level: Number(closeRow?.mid50Level || decompRow?.mid50Level || 0) || undefined,
      distanceToMid50: Number(closeRow?.distanceToMid50 || decompRow?.distanceToMid50 || 0) || undefined,
      pullDirection: closeRow?.pullDirection || decompRow?.pullDirection || undefined,
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
      assetClass: detectAssetClass(symbol),
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

/** Adaptive price formatting: 2 decimals for > $1, up to 8 for sub-cent */
// formatPrice imported from shared lib/formatPrice.ts

export default function TimeScannerPage() {
  const { tier, isLoading: tierLoading } = useUserTier();
  const searchParams = useSearchParams();
  const [symbol, setSymbol] = useState('BTCUSD');
  const [scanMode, setScanMode] = useState<ScanModeType>('intraday_1h');
  const [sessionMode, setSessionMode] = useState<'regular' | 'extended' | 'full'>('extended');
  const [input, setInput] = useState<TimeConfluenceV2Inputs>(FALLBACK_INPUT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialScanDone, setInitialScanDone] = useState(false);
  const [isMarketOpen, setIsMarketOpen] = useState<boolean>(true);
  const [scanTrigger, setScanTrigger] = useState(0);
  const timeAutoLogRef = useRef<string>('');
  const [selectedClusterTFs, setSelectedClusterTFs] = useState<string[] | null>(null);
  const [activeClusterLabel, setActiveClusterLabel] = useState<string | null>(null);
  const [selectedMid50TF, setSelectedMid50TF] = useState<string>('all');
  const [scanData, setScanData] = useState<{
    currentPrice: number;
    direction: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
    targetLevel: number;
    reasoning: string;
    expectedMoveTime: string;
    entry: number;
    stopLoss: number;
    takeProfit: number;
    riskReward: number;
    riskPct: number;
    rewardPct: number;
    signalStrength: string;
    netPull: string;
    mid50Levels: { tf: string; level: number; distance: number }[];
  } | null>(null);

  const runScan = async (overrides?: { symbol?: string; scanMode?: ScanModeType }) => {
    const effectiveSymbol = (overrides?.symbol ?? symbol).trim().toUpperCase();
    const effectiveMode = overrides?.scanMode ?? scanMode;
    if (!effectiveSymbol) return;

    setLoading(true);
    setError(null);
    setSelectedClusterTFs(null);
    setActiveClusterLabel(null);
    setSelectedMid50TF('all');
    try {
      const response = await fetch('/api/confluence-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: effectiveSymbol,
          mode: 'hierarchical',
          scanMode: effectiveMode,
          sessionMode,
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

      // ── Capture raw scan output for Direction + Target panel ──
      const sd = json.data;
      setScanData({
        currentPrice: Number(sd?.currentPrice || sd?.price || 0),
        direction: String(sd?.prediction?.direction || 'neutral') as 'bullish' | 'bearish' | 'neutral',
        confidence: Number(sd?.prediction?.confidence || 0),
        targetLevel: Number(sd?.prediction?.targetLevel || 0),
        reasoning: String(sd?.prediction?.reasoning || ''),
        expectedMoveTime: String(sd?.prediction?.expectedMoveTime || ''),
        entry: Number(sd?.tradeSetup?.entryPrice || sd?.currentPrice || 0),
        stopLoss: Number(sd?.tradeSetup?.stopLoss || 0),
        takeProfit: Number(sd?.tradeSetup?.takeProfit || 0),
        riskReward: Number(sd?.tradeSetup?.riskRewardRatio || 0),
        riskPct: Number(sd?.tradeSetup?.riskPercent || 0),
        rewardPct: Number(sd?.tradeSetup?.rewardPercent || 0),
        signalStrength: String(sd?.signalStrength || 'no_signal'),
        netPull: String(sd?.decompression?.netPullDirection || 'neutral'),
        mid50Levels: (() => {
          // Pull mid50 from the enriched close schedule (covers ALL TFs, not just
          // those within the scan mode's maxTFMinutes). This ensures the 50% Pull
          // Levels section shows every TF that appears in the Close Cluster Timeline.
          const closes: any[] = Array.isArray(sd?.candleCloseConfluence?.closes)
            ? sd.candleCloseConfluence.closes
            : [];
          const fromCloses = closes
            .filter((r: any) => r?.mid50Level && Number(r.mid50Level) > 0 && Number(r.tfMinutes || 0) >= 60)
            .map((r: any) => ({
              tf: String(r.tf || ''),
              level: Number(r.mid50Level),
              distance: Number(r.distanceToMid50 || 0),
            }));
          // De-duplicate by level (e.g. 7D and 1W are both 10080 min)
          const seen = new Set<string>();
          return fromCloses.filter((m: any) => {
            const key = `${m.level.toFixed(2)}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        })(),
      });

      // ── Auto-log to execution engine (paper trade) ──
      const tOut = computeTimeConfluenceV2(mapped);
      const dir = mapped.setup.primaryDirection;
      if (tOut.permission === 'ALLOW' && dir !== 'neutral' && tOut.timeConfluenceScore >= 60) {
        const key = `${effectiveSymbol}:${dir}:${Math.round(tOut.timeConfluenceScore)}`;
        if (timeAutoLogRef.current !== key) {
          timeAutoLogRef.current = key;
          const isCrypto = detectAssetClass(effectiveSymbol) === 'crypto';
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

  // Initial scan from URL params
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

  // Re-scan whenever scanMode or sessionMode changes via dropdown
  useEffect(() => {
    if (!initialScanDone || scanTrigger === 0) return;
    void runScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanTrigger]);

  const isCrypto = useMemo(() => detectAssetClass(symbol) === 'crypto', [symbol]);

  const out = computeTimeConfluenceV2(input);
  const displaySymbol = useMemo(() => input.context.symbol || symbol, [input.context.symbol, symbol]);
  const tone = permissionTone(out.permission);
  // Use real R:R from scan when available, otherwise fall back to estimate
  const rrDisplay = scanData && scanData.riskReward > 0 && Math.abs(scanData.entry - scanData.stopLoss) > 0.01
    ? scanData.riskReward.toFixed(1)
    : out.executionScore >= 70 ? '2.3' : out.executionScore >= 45 ? '1.7' : '—';
  const confluenceRows = [
    { label: 'Trend Alignment', score: out.contextScore },
    { label: 'Flow Strength', score: out.setupScore },
    { label: 'Close Confirmation', score: out.executionScore },
    { label: 'Cluster Integrity', score: input.setup.window.clusterIntegrity * 100 },
    { label: 'Window Quality', score: input.execution.entryWindowQuality * 100 },
  ];

  // Tier gate: require Pro Trader
  if (tierLoading) {
    return (
      <TimeScannerShell>
        <div className="flex min-h-[60vh] items-center justify-center text-slate-500">Loading…</div>
      </TimeScannerShell>
    );
  }
  if (!canAccessTimeScanner(tier)) {
    return (
      <TimeScannerShell>
        <UpgradeGate requiredTier="pro_trader" feature="Time Scanner" />
      </TimeScannerShell>
    );
  }

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
                  onChange={(event) => {
                    setScanMode(event.target.value as ScanModeType);
                    setScanTrigger((n) => n + 1);
                  }}
                  className="rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-1.5 text-xs text-slate-200"
                >
                  {TIMEFRAME_OPTIONS.map((option) => (
                    <option key={option} value={option}>{SCAN_MODE_LABELS[option]}</option>
                  ))}
                </select>
                {/* Session Mode selector — only visible for equities */}
                {!isCrypto && (
                  <select
                    value={sessionMode}
                    onChange={(event) => {
                      setSessionMode(event.target.value as 'regular' | 'extended' | 'full');
                      setScanTrigger((n) => n + 1);
                    }}
                    className="rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-1.5 text-xs text-slate-200"
                    title="Session hours — affects intraday candle close anchors"
                  >
                    <option value="regular">RTH (9:30–16:00)</option>
                    <option value="extended">Extended (4:00–20:00)</option>
                    <option value="full">Full (00:00–24:00)</option>
                  </select>
                )}
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
                {out.direction} • {SCAN_MODE_LABELS[scanMode]} • {displaySymbol}{!isCrypto ? ` • ${sessionMode === 'regular' ? 'RTH' : sessionMode === 'extended' ? 'Extended' : 'Full'}` : ''}
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
                <MetricPill label="Confluence" value={`${Math.round(out.timeConfluenceScore)}%`} />
                <MetricPill label="Risk" value={riskLabel(out.permission)} />
                <MetricPill label="R:R" value={rrDisplay} />
              </div>
            </div>
          </div>
        </section>

        {/* ═══ SCAN OUTPUT: Direction + Price Target ═══ */}
        {scanData && scanData.direction !== 'neutral' && (
          <section className="w-full rounded-2xl border bg-slate-900/50 p-4 lg:p-5" style={{
            borderColor: scanData.direction === 'bullish' ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)',
          }}>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.5fr]">
              {/* Left: Direction + Price */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className={`rounded-xl px-3 py-1.5 text-lg font-bold tracking-wide ${
                    scanData.direction === 'bullish'
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                  }`}>
                    {scanData.direction === 'bullish' ? '↑ BULLISH' : '↓ BEARISH'}
                  </div>
                  <div className="text-xs text-slate-400">
                    Alignment: <span className="font-semibold text-slate-200">{Math.min(100, Math.round(scanData.confidence <= 1 ? scanData.confidence * 100 : scanData.confidence))}%</span>
                    {scanData.signalStrength !== 'no_signal' && (
                      <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                        scanData.signalStrength === 'strong' ? 'bg-emerald-500/15 text-emerald-400'
                        : scanData.signalStrength === 'moderate' ? 'bg-amber-500/15 text-amber-400'
                        : 'bg-slate-700 text-slate-400'
                      }`}>{scanData.signalStrength}</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/30 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">Current</div>
                    <div className="text-base font-bold text-slate-100">{formatPrice(scanData.currentPrice)}</div>
                  </div>
                  <div className={`rounded-xl border px-3 py-2 ${
                    scanData.direction === 'bullish'
                      ? 'border-emerald-500/25 bg-emerald-500/5'
                      : 'border-rose-500/25 bg-rose-500/5'
                  }`}>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">Key Level</div>
                    <div className={`text-base font-bold ${
                      scanData.direction === 'bullish' ? 'text-emerald-400' : 'text-rose-400'
                    }`}>{scanData.targetLevel > 0 ? formatPrice(scanData.targetLevel) : '—'}</div>
                  </div>
                </div>

                {/* Reference / Risk / Reaction — only show when they differ meaningfully */}
                {scanData.entry > 0 && scanData.stopLoss > 0 && Math.abs(scanData.entry - scanData.stopLoss) > 0.01 && (
                  <div className="grid grid-cols-3 gap-1.5">
                    <div className="rounded-lg border border-slate-800 bg-slate-950/25 px-2 py-1.5 text-center">
                      <div className="text-[9px] uppercase tracking-wider text-slate-500">Reference</div>
                      <div className="text-xs font-semibold text-slate-200">{formatPrice(scanData.entry)}</div>
                    </div>
                    <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-2 py-1.5 text-center">
                      <div className="text-[9px] uppercase tracking-wider text-slate-500">Risk Level</div>
                      <div className="text-xs font-semibold text-rose-400">{formatPrice(scanData.stopLoss)}</div>
                      {scanData.riskPct > 0 && <div className="text-[9px] text-rose-500">-{scanData.riskPct.toFixed(1)}%</div>}
                    </div>
                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2 py-1.5 text-center">
                      <div className="text-[9px] uppercase tracking-wider text-slate-500">Reaction</div>
                      <div className="text-xs font-semibold text-emerald-400">{formatPrice(scanData.takeProfit)}</div>
                      {scanData.rewardPct > 0 && <div className="text-[9px] text-emerald-500">+{scanData.rewardPct.toFixed(1)}%</div>}
                    </div>
                  </div>
                )}

                {scanData.riskReward > 0 && Math.abs(scanData.entry - scanData.stopLoss) > 0.01 && (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    R:R Ratio: <span className={`font-bold ${
                      scanData.riskReward >= 2 ? 'text-emerald-400' : scanData.riskReward >= 1.5 ? 'text-amber-400' : 'text-rose-400'
                    }`}>{scanData.riskReward.toFixed(2)}</span>
                    {scanData.expectedMoveTime && !scanData.expectedMoveTime.startsWith('-') && (
                      <span className="text-slate-500">· Expected: {scanData.expectedMoveTime}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Right: Reasoning + 50% Levels */}
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/25 px-3 py-2.5">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Analysis</div>
                  <div className="text-xs leading-relaxed text-slate-300">{scanData.reasoning || 'Run scan for analysis.'}</div>
                </div>

                {(() => {
                  const allLevels = scanData.mid50Levels.filter((m) => m.level > 0);
                  if (allLevels.length === 0) return null;

                  // Filter by selected cluster TFs (if any)
                  const clusterFiltered = selectedClusterTFs
                    ? allLevels.filter((m) => selectedClusterTFs.includes(m.tf))
                    : allLevels;

                  // Then filter by individual TF dropdown
                  const validLevels = selectedMid50TF === 'all'
                    ? clusterFiltered
                    : clusterFiltered.filter((m) => m.tf === selectedMid50TF);

                  // Build dropdown options from the cluster-filtered set
                  const dropdownTFs = clusterFiltered.map((m) => m.tf);

                  return (
                    <div className="rounded-xl border border-slate-800 bg-slate-950/25 px-3 py-2.5">
                      <div className="mb-1.5 flex items-center justify-between">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          50% Pull Levels <span className={`ml-1 ${
                            scanData.netPull === 'bullish' ? 'text-emerald-400' : scanData.netPull === 'bearish' ? 'text-rose-400' : 'text-slate-500'
                          }`}>({scanData.netPull})</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {selectedClusterTFs && (
                            <button
                              type="button"
                              onClick={() => { setSelectedClusterTFs(null); setActiveClusterLabel(null); setSelectedMid50TF('all'); }}
                              className="rounded px-1.5 py-0.5 text-[9px] font-medium text-slate-500 hover:bg-slate-800 hover:text-slate-300"
                              title="Show all TF levels"
                            >
                              ✕ Clear
                            </button>
                          )}
                          <select
                            value={selectedMid50TF}
                            onChange={(e) => setSelectedMid50TF(e.target.value)}
                            className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-300"
                          >
                            <option value="all">All TFs ({clusterFiltered.length})</option>
                            {dropdownTFs.map((tf) => (
                              <option key={tf} value={tf}>{tf}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {validLevels.length > 0 ? (
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                          {validLevels.map((m) => (
                            <div key={m.tf} className="flex items-center justify-between">
                              <span className="font-medium text-slate-400">{m.tf}</span>
                              <span className="font-mono text-slate-300">{formatPrice(m.level)}
                                <span className={`ml-1 text-[10px] ${m.distance > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                  {m.distance > 0 ? '+' : ''}{m.distance.toFixed(1)}%
                                </span>
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-500">No mid50 data for this selection — click a cluster tile below to load levels.</div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </section>
        )}

        {scanData && scanData.direction === 'neutral' && (
          <section className="w-full rounded-2xl border border-slate-700/50 bg-slate-900/30 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-slate-700 bg-slate-800/30 px-3 py-1.5 text-sm font-bold text-slate-400">↔ NEUTRAL</div>
              <div className="text-xs text-slate-400">
                No directional bias detected — {scanData.reasoning || 'mixed signals across timeframes'}
              </div>
              {scanData.currentPrice > 0 && (
                <div className="ml-auto text-sm font-semibold text-slate-200">{formatPrice(scanData.currentPrice)}</div>
              )}
            </div>
          </section>
        )}

        {/* ═══ MARKET PRESSURE ENGINE ═══ */}
        {scanData && (
          <details className="w-full rounded-2xl border border-slate-800 bg-slate-900/30" open>
            <summary className="cursor-pointer list-none px-3 py-3 lg:px-5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-semibold text-slate-100">🔥 Market Pressure Engine</span>
                  <span className="ml-2 text-xs text-slate-400">Composite pressure from time, volatility, liquidity & options</span>
                </div>
                <div className="text-xs text-slate-500">▾ expand</div>
              </div>
            </summary>
            <div className="border-t border-slate-800 p-3 lg:p-5">
              <MarketPressureWidget
                symbol={symbol}
                scanMode={scanMode}
                sessionMode={sessionMode}
              />
            </div>
          </details>
        )}

        {/* ═══ ROW 2: STATIC INTRADAY SCHEDULE (equities only) + CLOSE CALENDAR ═══ */}
        {!isCrypto && (
          <section className="w-full rounded-2xl border border-slate-800 bg-slate-900/30 p-3 lg:p-5">
            <div className="mb-3">
              <div className="text-sm font-semibold text-slate-100">🕐 Intraday Equity Close Schedule</div>
              <div className="text-xs text-slate-400">
                Fixed candle closes every trading day ({sessionMode === 'regular' ? 'RTH 9:30–16:00 ET' : sessionMode === 'extended' ? 'Extended 4:00–20:00 ET' : 'Full 00:00–24:00 ET'}) — these never change
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="pb-1.5 pr-4 font-medium">Time (ET)</th>
                    <th className="pb-1.5 pr-4 font-medium">Event</th>
                    <th className="pb-1.5 font-medium">Candle Closes</th>
                  </tr>
                </thead>
                <tbody className="text-slate-300">
                  {sessionMode === 'regular' ? (
                    <>
                      {/* ── Regular (RTH): anchor 9:30 ET, closes on the :30 ── */}
                      <tr className="border-b border-slate-800/40 bg-emerald-500/5">
                        <td className="py-1.5 pr-4 font-mono font-semibold text-emerald-400">09:30</td>
                        <td className="py-1.5 pr-4 font-semibold text-emerald-300">NYSE Open</td>
                        <td className="py-1.5 text-slate-400">Session anchor — all intraday bars begin here</td>
                      </tr>
                      <tr className="border-b border-slate-800/40">
                        <td className="py-1.5 pr-4 font-mono text-slate-200">10:00</td>
                        <td className="py-1.5 pr-4">Opening Range</td>
                        <td className="py-1.5 text-slate-400">30M (9:30–10:00)</td>
                      </tr>
                      <tr className="border-b border-slate-800/40">
                        <td className="py-1.5 pr-4 font-mono text-slate-200">10:30</td>
                        <td className="py-1.5 pr-4">First Hourly Close</td>
                        <td className="py-1.5 text-slate-400">30M · <span className="text-emerald-400/80">1H (9:30–10:30)</span></td>
                      </tr>
                      <tr className="border-b border-slate-800/40">
                        <td className="py-1.5 pr-4 font-mono text-slate-200">11:30</td>
                        <td className="py-1.5 pr-4">European Close</td>
                        <td className="py-1.5 text-slate-400">30M · <span className="text-emerald-400/80">1H (10:30–11:30) · 2H (9:30–11:30)</span></td>
                      </tr>
                      <tr className="border-b border-slate-800/40">
                        <td className="py-1.5 pr-4 font-mono text-slate-200">12:30</td>
                        <td className="py-1.5 pr-4">Midday</td>
                        <td className="py-1.5 text-slate-400">30M · <span className="text-emerald-400/80">1H (11:30–12:30)</span></td>
                      </tr>
                      <tr className="border-b border-slate-800/40 bg-amber-500/5">
                        <td className="py-1.5 pr-4 font-mono font-semibold text-amber-400">13:30</td>
                        <td className="py-1.5 pr-4 font-semibold text-amber-300">Key Confluence</td>
                        <td className="py-1.5 text-slate-400">30M · <span className="text-emerald-400/80">1H · 2H (11:30–13:30) · 4H (9:30–13:30)</span></td>
                      </tr>
                      <tr className="border-b border-slate-800/40">
                        <td className="py-1.5 pr-4 font-mono text-slate-200">14:30</td>
                        <td className="py-1.5 pr-4">Afternoon</td>
                        <td className="py-1.5 text-slate-400">30M · <span className="text-emerald-400/80">1H (13:30–14:30)</span></td>
                      </tr>
                      <tr className="border-b border-slate-800/40">
                        <td className="py-1.5 pr-4 font-mono text-slate-200">15:30</td>
                        <td className="py-1.5 pr-4">Final Half-Hour</td>
                        <td className="py-1.5 text-slate-400">30M · <span className="text-emerald-400/80">1H (14:30–15:30) · 2H (13:30–15:30)</span></td>
                      </tr>
                      <tr className="border-b border-slate-800/40 bg-emerald-500/5">
                        <td className="py-1.5 pr-4 font-mono font-semibold text-emerald-400">16:00</td>
                        <td className="py-1.5 pr-4 font-semibold text-emerald-300">NYSE Close</td>
                        <td className="py-1.5 text-slate-400">30M · <span className="text-amber-400/80">1H (30m†) · 2H (30m†) · 4H (150m†)</span> · Daily</td>
                      </tr>
                    </>
                  ) : sessionMode === 'extended' ? (
                    <>
                      {/* ── Extended: anchor 4:00 ET, closes on the hour ── */}
                      <tr className="border-b border-slate-800/40">
                        <td className="py-1.5 pr-4 font-mono text-slate-400">04:00</td>
                        <td className="py-1.5 pr-4 text-slate-500">Session Open</td>
                        <td className="py-1.5 text-slate-500">New bars begin anchoring</td>
                      </tr>
                      <tr className="border-b border-slate-800/40">
                        <td className="py-1.5 pr-4 font-mono text-amber-400/80">08:00</td>
                        <td className="py-1.5 pr-4">Early Pre-Market</td>
                        <td className="py-1.5 text-slate-400">1H (7:00–8:00) · 2H (6:00–8:00) · 4H (4:00–8:00)</td>
                      </tr>
                      <tr className="border-b border-slate-800/40 bg-emerald-500/5">
                        <td className="py-1.5 pr-4 font-mono font-semibold text-emerald-400">09:30</td>
                        <td className="py-1.5 pr-4 font-semibold text-emerald-300">NYSE Open</td>
                        <td className="py-1.5 text-slate-400">30M (9:00–9:30) — RTH volume surge</td>
                      </tr>
                      <tr className="border-b border-slate-800/40">
                        <td className="py-1.5 pr-4 font-mono text-slate-200">10:00</td>
                        <td className="py-1.5 pr-4">Opening Range Close</td>
                        <td className="py-1.5 text-slate-400">30M · 1H (9:00–10:00) · 2H (8:00–10:00) · 3H (7:00–10:00) · 6H (4:00–10:00)</td>
                      </tr>
                      <tr className="border-b border-slate-800/40 bg-amber-500/5">
                        <td className="py-1.5 pr-4 font-mono font-semibold text-amber-400">12:00</td>
                        <td className="py-1.5 pr-4 font-semibold text-amber-300">Midday</td>
                        <td className="py-1.5 text-slate-400">1H (11:00–12:00) · 2H (10:00–12:00) · 4H (8:00–12:00) · 8H (4:00–12:00)</td>
                      </tr>
                      <tr className="border-b border-slate-800/40">
                        <td className="py-1.5 pr-4 font-mono text-slate-200">14:00</td>
                        <td className="py-1.5 pr-4">Mid-Afternoon</td>
                        <td className="py-1.5 text-slate-400">30M (13:30–14:00) · 1H (13:00–14:00) · 2H (12:00–14:00)</td>
                      </tr>
                      <tr className="border-b border-slate-800/40 bg-emerald-500/5">
                        <td className="py-1.5 pr-4 font-mono font-semibold text-emerald-400">16:00</td>
                        <td className="py-1.5 pr-4 font-semibold text-emerald-300">NYSE Close</td>
                        <td className="py-1.5 text-slate-400">30M (15:30–16:00) · 1H (15:00–16:00) · 2H (14:00–16:00) · 4H (12:00–16:00) · Daily (9:30–16:00)</td>
                      </tr>
                      <tr className="border-b border-slate-800/40 bg-slate-800/20">
                        <td className="py-1.5 pr-4 font-mono font-semibold text-amber-400/80">20:00</td>
                        <td className="py-1.5 pr-4 font-semibold text-amber-300/80">After-Hours Close</td>
                        <td className="py-1.5 text-slate-400">1H (19:00–20:00) · 2H (18:00–20:00) · 4H (16:00–20:00)</td>
                      </tr>
                    </>
                  ) : (
                    <>
                      {/* ── Full: anchor 0:00 ET, closes on the hour ── */}
                      <tr className="border-b border-slate-800/40">
                        <td className="py-1.5 pr-4 font-mono text-slate-400">00:00</td>
                        <td className="py-1.5 pr-4 text-slate-500">Session Open</td>
                        <td className="py-1.5 text-slate-500">New bars begin anchoring</td>
                      </tr>
                      <tr className="border-b border-slate-800/40">
                        <td className="py-1.5 pr-4 font-mono text-amber-400/80">08:00</td>
                        <td className="py-1.5 pr-4">Early Pre-Market</td>
                        <td className="py-1.5 text-slate-400">8H (0:00–8:00) · 4H (4:00–8:00) · 2H (6:00–8:00) · 1H (7:00–8:00)</td>
                      </tr>
                      <tr className="border-b border-slate-800/40 bg-emerald-500/5">
                        <td className="py-1.5 pr-4 font-mono font-semibold text-emerald-400">09:30</td>
                        <td className="py-1.5 pr-4 font-semibold text-emerald-300">NYSE Open</td>
                        <td className="py-1.5 text-slate-400">30M (9:00–9:30) — RTH volume surge</td>
                      </tr>
                      <tr className="border-b border-slate-800/40">
                        <td className="py-1.5 pr-4 font-mono text-slate-200">10:00</td>
                        <td className="py-1.5 pr-4">Opening Range Close</td>
                        <td className="py-1.5 text-slate-400">30M · 1H (9:00–10:00) · 2H (8:00–10:00) · 3H (7:00–10:00)</td>
                      </tr>
                      <tr className="border-b border-slate-800/40 bg-amber-500/5">
                        <td className="py-1.5 pr-4 font-mono font-semibold text-amber-400">12:00</td>
                        <td className="py-1.5 pr-4 font-semibold text-amber-300">Midday</td>
                        <td className="py-1.5 text-slate-400">1H · 2H · 4H (8:00–12:00) · 6H (6:00–12:00) · 12H (0:00–12:00)</td>
                      </tr>
                      <tr className="border-b border-slate-800/40">
                        <td className="py-1.5 pr-4 font-mono text-slate-200">14:00</td>
                        <td className="py-1.5 pr-4">Mid-Afternoon</td>
                        <td className="py-1.5 text-slate-400">1H (13:00–14:00) · 2H (12:00–14:00)</td>
                      </tr>
                      <tr className="border-b border-slate-800/40 bg-emerald-500/5">
                        <td className="py-1.5 pr-4 font-mono font-semibold text-emerald-400">16:00</td>
                        <td className="py-1.5 pr-4 font-semibold text-emerald-300">NYSE Close</td>
                        <td className="py-1.5 text-slate-400">1H · 2H · 4H (12:00–16:00) · 8H (8:00–16:00)</td>
                      </tr>
                      <tr className="border-b border-slate-800/40 bg-slate-800/20">
                        <td className="py-1.5 pr-4 font-mono font-semibold text-amber-400/80">20:00</td>
                        <td className="py-1.5 pr-4 font-semibold text-amber-300/80">After-Hours End</td>
                        <td className="py-1.5 text-slate-400">4H (16:00–20:00) · 2H (18:00–20:00) · 1H (19:00–20:00)</td>
                      </tr>
                      <tr className="border-b border-slate-800/40 bg-slate-800/20">
                        <td className="py-1.5 pr-4 font-mono font-semibold text-slate-400">00:00</td>
                        <td className="py-1.5 pr-4 font-semibold text-slate-400">Full Session Close</td>
                        <td className="py-1.5 text-slate-400">8H (16:00–00:00) · 12H (12:00–00:00) · Daily — full 24h candle</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-[10px] text-slate-600">
              {sessionMode === 'regular'
                ? '† Partial bar — session is 6.5 hours (390 min), so the final 1H is only 30 min (15:30→16:00). Repeats Mon–Fri, excluding NYSE holidays.'
                : 'Repeats identically every trading day (Mon–Fri, excluding NYSE holidays). Only daily+ timeframes have variable close dates.'}
            </div>
          </section>
        )}

        <CloseCalendar
          symbol={symbol}
          activeClusterLabel={activeClusterLabel ?? undefined}
          onClusterClick={(tfs, label) => {
            // Toggle: clicking the same cluster again deselects it
            if (activeClusterLabel === label) {
              setSelectedClusterTFs(null);
              setActiveClusterLabel(null);
              setSelectedMid50TF('all');
            } else {
              setSelectedClusterTFs(tfs);
              setActiveClusterLabel(label);
              setSelectedMid50TF('all');
            }
          }}
        />

        {/* ═══ ROW 3: CONFLUENCE ENGINE + EXECUTION (collapsible — collapsed by default) ═══ */}
        <details className="w-full rounded-2xl border border-slate-800 bg-slate-900/30">
          <summary className="cursor-pointer list-none px-3 py-3 lg:px-5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-semibold text-slate-100">⏱ Time Confluence Engine</span>
                <span className="ml-2 text-xs text-slate-400">Alignment score, decompression & structure</span>
              </div>
              <div className="text-xs text-slate-500">▾ expand</div>
            </div>
          </summary>
          <div className="border-t border-slate-800 p-3 lg:p-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr] lg:gap-6">
            <div className="space-y-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">Confluence Engine</div>
                <div className="text-xs text-slate-400">Time alignment → confluence quality</div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/25 p-3">
                <div className="space-y-3">
                  {confluenceRows.filter((row) => Math.round(row.score) > 0).length > 0 ? (
                    confluenceRows.filter((row) => Math.round(row.score) > 0).map((row) => (
                      <ConfluenceRow key={row.label} label={row.label} score={row.score} />
                    ))
                  ) : (
                    <div className="py-2 text-center text-xs text-slate-500">Run a scan to populate confluence data</div>
                  )}
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

        {/* ═══ ROW 4: TIME GRAVITY MAP (collapsible) ═══ */}
        <details className="w-full rounded-2xl border border-slate-800 bg-slate-900/30">
          <summary className="cursor-pointer list-none px-3 py-3 lg:px-5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-semibold text-slate-100">🧲 Time Gravity Map</span>
                <span className="ml-2 text-xs text-slate-400">Midpoint debt, decompression windows & gravity fields</span>
              </div>
              <div className="text-xs text-slate-500">▾ expand</div>
            </div>
          </summary>
          <div className="border-t border-slate-800 p-3 lg:p-5">
            <TimeGravityMapWidget
              symbol={symbol}
              currentPrice={scanData?.currentPrice || undefined}
              assetType={input.context.assetClass === 'equity' ? 'stock' : 'crypto'}
            />
          </div>
        </details>

        {/* ── Intel accordion sections removed — core purpose is cluster + direction output ── */}
      </main>
    </TimeScannerShell>
  );
}
