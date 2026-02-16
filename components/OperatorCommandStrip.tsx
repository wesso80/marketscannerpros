'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { DEFAULT_OPERATOR_STATE, readOperatorState, writeOperatorState, type OperatorFlowMode, type OperatorState } from '@/lib/operatorState';

function modeFromPath(pathname: string): OperatorFlowMode {
  if (pathname.startsWith('/tools/portfolio') || pathname.startsWith('/tools/journal')) return 'MANAGE';
  if (pathname.startsWith('/tools/confluence-scanner') || pathname.startsWith('/tools/backtest')) return 'EXECUTE';
  if (pathname.startsWith('/tools/deep-analysis') || pathname.startsWith('/tools/options-confluence') || pathname.startsWith('/tools/ai-analyst')) return 'EVALUATE';
  if (pathname.startsWith('/tools/scanner') || pathname.startsWith('/tools/watchlists') || pathname.startsWith('/tools/alerts')) return 'ORIENT';
  return 'OBSERVE';
}

function toneClass(value: string, type: 'bias' | 'action' | 'risk' | 'edge') {
  if (type === 'edge') {
    const edge = Number(value);
    if (edge >= 70) return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
    if (edge >= 55) return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
    return 'text-red-400 border-red-500/30 bg-red-500/10';
  }
  if (value === 'BULLISH' || value === 'EXECUTE' || value === 'LOW') return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
  if (value === 'BEARISH' || value === 'HIGH') return 'text-red-400 border-red-500/30 bg-red-500/10';
  return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
}

export default function OperatorCommandStrip() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<OperatorState>(DEFAULT_OPERATOR_STATE);

  const mode = useMemo(() => modeFromPath(pathname), [pathname]);

  useEffect(() => {
    const sync = () => {
      const stored = readOperatorState();
      const qSymbol = searchParams.get('symbol');
      const merged: OperatorState = {
        ...stored,
        mode,
        symbol: qSymbol?.trim().toUpperCase() || stored.symbol,
      };
      setState(merged);
      writeOperatorState(merged);
    };

    sync();
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'msp_operator_state_v1') sync();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [searchParams, mode]);

  const flowStatus =
    mode === 'OBSERVE'
      ? '✓ Market Context  → Opportunity Discovery  ○ Awaiting Evaluation'
      : mode === 'ORIENT'
      ? '✓ Market Context  ✓ Opportunity Found  → Qualification Active'
      : mode === 'EVALUATE'
      ? '✓ Context  ✓ Opportunity  → Evaluation Active  ○ Awaiting Execution'
      : mode === 'EXECUTE'
      ? '✓ Context  ✓ Evaluation  → Execution Timing Active'
      : '✓ Context  ✓ Evaluation  ✓ Execution  → Manage/Learn Active';

  return (
    <div className="sticky top-12 z-[95] mb-3 rounded-xl border border-slate-700/70 bg-slate-900/85 px-3 py-2 backdrop-blur">
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-cyan-300">Mode {mode}</span>
        <span className="rounded-full border border-slate-700 bg-slate-800/70 px-2 py-0.5 text-[11px] font-semibold text-slate-300">Symbol {state.symbol}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${toneClass(String(state.edge), 'edge')}`}>Edge {state.edge}%</span>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${toneClass(state.bias, 'bias')}`}>Bias {state.bias}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${toneClass(state.action, 'action')}`}>Action {state.action}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${toneClass(state.risk, 'risk')}`}>Risk {state.risk}</span>
        <span className="rounded-full border border-slate-700 bg-slate-800/70 px-2 py-0.5 text-[11px] font-semibold text-slate-300">Next {state.next}</span>
      </div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
        Operator Flow: {flowStatus}
      </div>
    </div>
  );
}
