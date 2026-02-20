"use client";

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import PageShell from '@/components/msp/layout/PageShell';
import OptionsHeaderBar from '@/components/msp/options/OptionsHeaderBar';
import ContextLayer from '@/components/msp/options/ContextLayer';
import SetupLayer from '@/components/msp/options/SetupLayer';
import ExecutionLayer from '@/components/msp/options/ExecutionLayer';
import DecisionBar from '@/components/msp/options/DecisionBar';
import EvidenceAccordion from '@/components/msp/options/EvidenceAccordion';

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

const TIMEFRAME_OPTIONS: Array<{ value: ScanModeType; label: string }> = [
  { value: 'intraday_1h', label: 'Intraday 1H' },
  { value: 'intraday_4h', label: 'Intraday 4H' },
  { value: 'swing_1d', label: 'Swing 1D' },
  { value: 'swing_1w', label: 'Swing 1W' },
  { value: 'macro_monthly', label: 'Macro Monthly' },
];

function normalizePayload(raw: any) {
  const data = raw?.data || {};
  const topCandidate = data?.universalScoringV21?.topCandidates?.[0];
  if (!topCandidate) return null;

  const spreadLiquidity = Number(topCandidate?.features?.execution?.spreadLiquidity ?? 0);
  const spreadState = spreadLiquidity >= 0.7 ? 'Tight' : spreadLiquidity >= 0.5 ? 'Moderate' : 'Wide';

  return {
    ...topCandidate,
    timeGate: data?.universalScoringV21?.timeGate,
    context: {
      riskMode: data?.capitalFlow?.market_mode || 'neutral',
      breadth: data?.institutionalFilter?.finalGrade || 'Mixed',
      sectorBias: data?.direction || 'neutral',
      vixState: data?.expectedMove?.selectedExpiryPercent ? `${Number(data.expectedMove.selectedExpiryPercent).toFixed(1)}% EM` : 'N/A',
    },
    execution: {
      spreadState,
    },
  };
}

export default function OptionsPage() {
  const searchParams = useSearchParams();
  const [symbol, setSymbol] = useState('SPY');
  const [scanMode, setScanMode] = useState<ScanModeType>('intraday_1h');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<any>(null);
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
      const normalized = normalizePayload(json);
      if (!normalized) {
        setError('No v2.1 option candidates returned yet for this symbol/timeframe');
        setPayload(null);
        return;
      }
      setPayload(normalized);
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
    const validTf = TIMEFRAME_OPTIONS.some((option) => option.value === tfParam);

    const initialSymbol = symbolParam || 'SPY';
    const initialTf: ScanModeType = validTf ? tfParam : 'intraday_1h';

    setSymbol(initialSymbol);
    setScanMode(initialTf);
    void runScan({ symbol: initialSymbol, scanMode: initialTf });
  }, [initialScanDone, loading, searchParams]);

  return (
    <PageShell>
      <OptionsHeaderBar />

      <section className="rounded-2xl border border-[var(--msp-border)] bg-[var(--msp-panel)] p-4">
        <div className="grid grid-cols-12 gap-3">
          <input
            value={symbol}
            onChange={(event) => setSymbol(event.target.value.toUpperCase())}
            placeholder="Symbol (e.g. SPY)"
            className="col-span-12 rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-2 text-sm text-[var(--msp-text)] md:col-span-4"
          />
          <select
            value={scanMode}
            onChange={(event) => setScanMode(event.target.value as ScanModeType)}
            className="col-span-12 rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-2 text-sm text-[var(--msp-text)] md:col-span-4"
          >
            {TIMEFRAME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={runScan}
            disabled={loading}
            className="col-span-12 rounded-lg border border-[var(--msp-accent)] bg-[var(--msp-accent)]/15 px-4 py-2 text-sm font-semibold text-[var(--msp-accent)] disabled:opacity-50 md:col-span-4"
          >
            {loading ? 'Scanning…' : 'Run Institutional Scan'}
          </button>
        </div>
        {error && <div className="mt-3 text-sm text-red-300">{error}</div>}
      </section>

      <ContextLayer payload={payload} />
      <SetupLayer payload={payload} />
      <ExecutionLayer payload={payload} />
      <DecisionBar payload={payload} />
      <EvidenceAccordion payload={payload} />
    </PageShell>
  );
}
