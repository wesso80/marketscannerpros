'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRiskPermission } from './RiskPermissionContext';
import { formatDollar, rToDollar } from '@/lib/riskDisplay';

function tone(value: 'ok' | 'warn' | 'block') {
  if (value === 'ok') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  if (value === 'warn') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
}

export default function CapitalControlStrip() {
  const { snapshot, loading, isLocked, guardEnabled, setGuardEnabled } = useRiskPermission();
  const [accountSize, setAccountSize] = useState(100000);

  useEffect(() => {
    let mounted = true;
    const loadAccount = async () => {
      try {
        const res = await fetch('/api/portfolio', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const latestValue = Number(data?.performanceHistory?.[data.performanceHistory.length - 1]?.totalValue || 0);
        const fallback = Number(data?.totalValue || 0);
        const next = latestValue > 0 ? latestValue : fallback > 0 ? fallback : 100000;
        if (mounted) setAccountSize(next);
      } catch {
      }
    };
    void loadAccount();
  }, []);

  if (loading || !snapshot) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-400">
        Loading Capital Control Strip...
      </div>
    );
  }

  const dataTone = snapshot.data_health.status === 'OK' ? 'ok' : snapshot.data_health.status === 'DEGRADED' ? 'warn' : 'block';
  const modeTone = snapshot.risk_mode === 'LOCKED' ? 'block' : snapshot.risk_mode === 'THROTTLED' || snapshot.risk_mode === 'DEFENSIVE' ? 'warn' : 'ok';
  const oneRiskFraction = useMemo(() => Math.max(0.001, snapshot.caps.risk_per_trade), [snapshot.caps.risk_per_trade]);
  const remainingDollar = rToDollar(snapshot.session.remaining_daily_R, accountSize, oneRiskFraction);
  const openRiskDollar = rToDollar(snapshot.session.open_risk_R, accountSize, oneRiskFraction);

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className={`rounded-md border px-2 py-1 font-semibold ${tone(modeTone)}`}>Risk Mode: {snapshot.risk_mode}</span>
        <span className="rounded-md border border-slate-700 bg-slate-950/50 px-2 py-1 text-slate-200">
          Remaining: <span className="metric-r">{snapshot.session.remaining_daily_R.toFixed(1)}R</span>
          <span className="metric-dollar">({formatDollar(remainingDollar)})</span>
        </span>
        <span className="rounded-md border border-slate-700 bg-slate-950/50 px-2 py-1 text-slate-200">
          Open Risk: <span className="metric-r">{snapshot.session.open_risk_R.toFixed(1)}R</span>
          <span className="metric-dollar">({formatDollar(openRiskDollar)})</span>
        </span>
        <span className="rounded-md border border-slate-700 bg-slate-950/50 px-2 py-1 text-slate-200">Gross: {snapshot.caps.gross_max.toFixed(2)}x</span>
        <span className="rounded-md border border-slate-700 bg-slate-950/50 px-2 py-1 text-slate-200">Cluster: {snapshot.caps.cluster_max.toFixed(2)}x</span>
        <span className={`rounded-md border px-2 py-1 font-semibold ${tone(dataTone)}`}>Data: {snapshot.data_health.status}</span>
        <span className="rounded-md border border-slate-700 bg-slate-950/50 px-2 py-1 text-slate-200">Add-ons: {snapshot.caps.add_ons_allowed ? 'Enabled' : 'Disabled'}</span>
        <button
          onClick={() => { void setGuardEnabled(!guardEnabled); }}
          className={`rounded-md border px-2 py-1 font-semibold ${guardEnabled ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-slate-600 bg-slate-800 text-slate-300'}`}
          title="Toggle educational rule guard for this user"
        >
          Rule Guard: {guardEnabled ? 'ON' : 'OFF'}
        </button>
        <span className="ml-auto text-[10px] text-slate-400">Educational guardrails only — no brokerage execution</span>
      </div>
      {isLocked && (
        <div className="mt-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] font-semibold text-rose-200">
          Tracking Locked (Rule Guard Active): new simulated entries disabled across tools.
        </div>
      )}
    </div>
  );
}
