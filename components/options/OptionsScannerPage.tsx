"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import OptionsScannerLayout from '@/components/options/layout/OptionsScannerLayout';
import { fireAutoLog } from '@/lib/autoLog';
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
  const optionsAutoLogRef = useRef<string>('');

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

      if (!response.ok) {
        const errBody = await response.json().catch(() => null);
        setError(errBody?.error || `HTTP ${response.status}`);
        setPayload(null);
        return;
      }
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

      // ── Auto-log to execution engine (paper trade) ──
      const dir = mapped?.decision?.direction;
      const conf = mapped?.decision?.confidence ?? 0;
      const perm = mapped?.decision?.permission;
      if (dir && dir !== 'NEUTRAL' && conf >= 60 && perm === 'GO') {
        const sym = effectiveSymbol;
        const key = `${sym}:${dir}:${conf}`;
        if (optionsAutoLogRef.current !== key) {
          optionsAutoLogRef.current = key;
          fireAutoLog({
            symbol: sym,
            conditionType: 'options_scanner',
            conditionMet: `${dir}_CONF_${conf}`,
            triggerPrice: mapped?.header?.underlyingPrice ?? 0,
            source: 'options_scanner',
            assetClass: 'equity',
            atr: null,
          }).catch(() => {});
        }
      }
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
      onDeploy: () => {
        if (!payload) return;
        alert(`⚠️ Educational Mode\n\nDeploy signal for ${symbol}:\nDirection: ${payload.decision.direction}\nConfidence: ${payload.decision.confidence}%\n\nThis is a simulated workflow — no broker execution.`);
      },
      onAlert: async () => {
        try {
          const res = await fetch('/api/alerts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              symbol: symbol.toUpperCase(),
              condition_type: 'price_above',
              condition_value: payload?.header?.underlyingPrice || 0,
              alert_name: `Options: ${symbol} ${payload?.decision?.direction || 'NEUTRAL'} signal`,
            }),
          });
          if (res.ok) alert(`✅ Alert created for ${symbol}`);
          else alert('Failed to create alert');
        } catch { alert('Failed to create alert — network error'); }
      },
      onWatchlist: async () => {
        try {
          const res = await fetch('/api/watchlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              symbol: symbol.toUpperCase(),
              note: `Options scan: ${payload?.decision?.direction || 'N/A'} @ confidence ${payload?.decision?.confidence || 0}%`,
            }),
          });
          if (res.ok) alert(`✅ ${symbol} added to watchlist`);
          else alert('Failed to add to watchlist');
        } catch { alert('Failed to add to watchlist — network error'); }
      },
      onJournal: () => {
        const params = new URLSearchParams({
          symbol: symbol.toUpperCase(),
          direction: payload?.decision?.direction === 'BULLISH' ? 'LONG' : payload?.decision?.direction === 'BEARISH' ? 'SHORT' : 'LONG',
          source: 'options-scanner',
          confidence: String(payload?.decision?.confidence || 50),
        });
        window.location.href = `/tools/journal?${params.toString()}`;
      },
    }),
    [payload, symbol],
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
    <div className="min-h-screen bg-[var(--msp-bg)] text-slate-100">
      <main className="mx-auto w-full max-w-none space-y-5 px-4 py-4 lg:px-6 lg:py-6">
        {error && <div className="text-sm text-rose-300">{error}</div>}

        <OptionsScannerLayout
          header={payload?.header || fallbackHeader}
          decision={payload?.decision || fallbackDecision}
          symbol={symbol}
          scanMode={scanMode}
          loading={loading}
          onSymbolChange={(next) => setSymbol(next.toUpperCase())}
          onScanModeChange={(next) => setScanMode(next)}
          onRunScan={() => {
            void runScan();
          }}
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
    <Suspense fallback={<div className="min-h-screen bg-[var(--msp-bg)]" />}>
      <OptionsScannerPageContent />
    </Suspense>
  );
}
