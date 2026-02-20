"use client";

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import DeskHeaderSticky from '@/components/options/layer0/DeskHeaderSticky';
import OptionsScannerLayout from '@/components/options/layout/OptionsScannerLayout';
import { buildInitialEvidenceOpen, getAutoOpenKeys } from '@/lib/options/autoOpenLogic';
import { mapOptionsScanResponseToV3 } from '@/lib/options/mapPayload';
import {
  DecisionActions,
  DeskHeaderModel,
  DecisionModel,
  EvidenceModuleKey,
  OptionsScannerPayload,
} from '@/types/optionsScanner';

type ScanModeType =
  | 'scalping'
  | 'intraday_30m'
  | 'intraday_1h'
  | 'intraday_4h'
  | 'swing_1d'
  | 'swing_3d'
  | 'swing_1w'
  | 'macro_monthly'
  | 'macro_yearly';

const TIMEFRAME_OPTIONS: ScanModeType[] = ['intraday_1h', 'intraday_4h', 'swing_1d', 'swing_1w', 'macro_monthly'];

function OptionsScannerPageContent() {
  const searchParams = useSearchParams();
  const [symbol, setSymbol] = useState('SPY');
  const [scanMode, setScanMode] = useState<ScanModeType>('intraday_1h');
  const [viewMode, setViewMode] = useState<'normal' | 'compact'>('normal');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<OptionsScannerPayload | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState<Record<EvidenceModuleKey, boolean>>({
    structure: false,
    optionsFlow: false,
    greeksIv: false,
    liquidityTape: false,
    aiNarrative: false,
    riskCompliance: false,
  });
  const [initialScanDone, setInitialScanDone] = useState(false);

  const runScan = async (overrides?: { symbol?: string; scanMode?: ScanModeType }) => {
    const effectiveSymbol = (overrides?.symbol ?? symbol).trim().toUpperCase();
    const effectiveScanMode = overrides?.scanMode ?? scanMode;
    if (!effectiveSymbol) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/options-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: effectiveSymbol, scanMode: effectiveScanMode }),
      });

      const json = await response.json();
      if (!json?.success) {
        setError(json?.error || 'Scan failed');
        setPayload(null);
        return;
      }

      const mapped = mapOptionsScanResponseToV3(json, effectiveSymbol);
      if (!mapped) {
        setError('No scanner payload available for this symbol/timeframe.');
        setPayload(null);
        return;
      }

      const autoOpen = getAutoOpenKeys(mapped);
      setEvidenceOpen(buildInitialEvidenceOpen(autoOpen));
      setPayload(mapped);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : 'Network error');
      setPayload(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialScanDone || loading) return;
    setInitialScanDone(true);

    const symbolParam = (searchParams.get('symbol') || '').trim().toUpperCase();
    const tfParam = (searchParams.get('tf') || '').trim() as ScanModeType;
    const validTf = TIMEFRAME_OPTIONS.includes(tfParam);

    const initialSymbol = symbolParam || 'SPY';
    const initialTf: ScanModeType = validTf ? tfParam : 'intraday_1h';

    setSymbol(initialSymbol);
    setScanMode(initialTf);
    void runScan({ symbol: initialSymbol, scanMode: initialTf });
  }, [initialScanDone, loading, searchParams]);

  const actions: DecisionActions = useMemo(
    () => ({
      deployEnabled: payload?.decision.permission === 'GO',
      alertEnabled: true,
      watchlistEnabled: true,
      journalEnabled: payload?.decision.permission === 'GO',
      onDeploy: () => {},
      onAlert: () => {},
      onWatchlist: () => {},
      onJournal: () => {},
    }),
    [payload?.decision.permission],
  );

  const fallbackHeader: DeskHeaderModel = {
    symbol,
    underlyingPrice: 0,
    sessionLabel: 'regular',
    regime: { marketRegime: 'UNKNOWN', volatility: 'Unknown', liquidity: 'Unknown' },
    feed: { integrity: 'UNKNOWN', latencySec: null, feedStatus: 'unknown' },
  };

  const fallbackDecision: DecisionModel = {
    permission: 'WAIT',
    direction: 'NEUTRAL',
    confidence: 50,
    quality: 'Med',
    primaryDriver: 'Run scan to generate decision context.',
    primaryBlocker: 'No payload loaded.',
    flipTrigger: 'Await scan results',
    catalystWindow: 'N/A',
    validityLabel: 'N/A',
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <DeskHeaderSticky header={payload?.header || fallbackHeader} />

      <main className="mx-auto w-full max-w-[1280px] space-y-4 px-4 py-4">
        <section className="rounded-2xl border border-white/5 bg-slate-900/40 p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <input
              value={symbol}
              onChange={(event) => setSymbol(event.target.value.toUpperCase())}
              placeholder="Symbol"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100"
            />
            <select
              value={scanMode}
              onChange={(event) => setScanMode(event.target.value as ScanModeType)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100"
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
              className="rounded-lg bg-emerald-500/20 px-3 py-2 text-sm font-semibold text-emerald-200 disabled:opacity-50"
            >
              {loading ? 'Scanning…' : 'Run Options v3'}
            </button>
          </div>
          {error && <div className="mt-3 text-sm text-rose-300">{error}</div>}
        </section>

        <OptionsScannerLayout
          header={payload?.header || fallbackHeader}
          decision={payload?.decision || fallbackDecision}
          setup={
            payload?.setup || {
              setupType: 'N/A',
              timeframeAlignment: 'N/A',
              volRegime: 'N/A',
              optionsRegime: 'N/A',
              invalidation: 'N/A',
            }
          }
          plan={
            payload?.plan || {
              entry: 'N/A',
              stop: 'N/A',
              targets: [],
              rPreview: 'N/A',
              riskGovernor: 'N/A',
              positionSuggestion: 'N/A',
            }
          }
          evidenceSummary={payload?.evidenceSummary || { confirmations: 0, conflicts: 0, signals: 0 }}
          evidence={
            payload?.evidence || {
              structure: { trendStructure: 'N/A', keyLevels: [], state: 'N/A' },
              optionsFlow: { callPutPressure: 'N/A', oiChange: 'N/A', unusualActivity: 'N/A', volumeBursts: 'N/A' },
              greeksIv: { ivRank: 'N/A', ivPercentile: 'N/A', skewTerm: 'N/A', greeksSummary: 'N/A', gammaRisk: 'N/A' },
              liquidityTape: { magnetLevels: 'N/A', sweepFlags: 'N/A', volumeProfile: 'N/A' },
              aiNarrative: { summaryBullets: [], signalChecklist: [] },
              riskCompliance: { dataIntegrity: 'N/A', latency: 'N/A', whyBlocked: 'N/A' },
            }
          }
          viewMode={viewMode}
          onToggleViewMode={() => setViewMode((prev) => (prev === 'normal' ? 'compact' : 'normal'))}
          actions={actions}
          evidenceOpen={evidenceOpen}
          onToggleEvidence={(key) => setEvidenceOpen((prev) => ({ ...prev, [key]: !prev[key] }))}
          onExpandAll={() =>
            setEvidenceOpen({
              structure: true,
              optionsFlow: true,
              greeksIv: true,
              liquidityTape: true,
              aiNarrative: true,
              riskCompliance: true,
            })
          }
          onCollapseAll={() =>
            setEvidenceOpen({
              structure: false,
              optionsFlow: false,
              greeksIv: false,
              liquidityTape: false,
              aiNarrative: false,
              riskCompliance: false,
            })
          }
        />
      </main>
    </div>
  );
}

export default function OptionsScannerPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
      <OptionsScannerPageContent />
    </Suspense>
  );
}
