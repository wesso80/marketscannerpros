'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRiskPermission } from '@/components/risk/RiskPermissionContext';
import { useRegime, regimeBadgeColor } from '@/lib/useRegime';

const SESSION_BRIEFING_KEY = 'msp_session_briefing_ack';
const MIN_DISPLAY_SECONDS = 5;

/**
 * Session Start Briefing — Institutional "sign-on" screen.
 * Shown once per session before the trader can interact with tools.
 * Requires acknowledgment after reviewing regime, limits, and overnight state.
 */
export default function SessionStartBriefing({ children }: { children: React.ReactNode }) {
  const { snapshot, loading: riskLoading } = useRiskPermission();
  const { data: regime, loading: regimeLoading } = useRegime();
  const [acknowledged, setAcknowledged] = useState(true); // Default true to avoid flash
  const [displayTime, setDisplayTime] = useState(0);
  const [mounted, setMounted] = useState(false);

  // Check if already acknowledged this session
  useEffect(() => {
    setMounted(true);
    const today = new Date().toISOString().slice(0, 10);
    const stored = typeof window !== 'undefined' ? sessionStorage.getItem(SESSION_BRIEFING_KEY) : null;
    if (stored === today) {
      setAcknowledged(true);
    } else {
      setAcknowledged(false);
    }
  }, []);

  // Count up display time
  useEffect(() => {
    if (acknowledged) return;
    const interval = window.setInterval(() => {
      setDisplayTime(prev => prev + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [acknowledged]);

  const canAcknowledge = displayTime >= MIN_DISPLAY_SECONDS && !riskLoading && !regimeLoading;

  const handleAcknowledge = useCallback(() => {
    if (!canAcknowledge) return;
    const today = new Date().toISOString().slice(0, 10);
    sessionStorage.setItem(SESSION_BRIEFING_KEY, today);
    setAcknowledged(true);
  }, [canAcknowledge]);

  const goNoGoStatus = useMemo<'GO' | 'CONDITIONAL' | 'NO_GO'>(() => {
    if (!snapshot) return 'CONDITIONAL';
    if (snapshot.risk_mode === 'LOCKED' || snapshot.data_health.status === 'DOWN' || snapshot.session.remaining_daily_R <= 0) return 'NO_GO';
    if (snapshot.risk_mode === 'DEFENSIVE' || snapshot.risk_mode === 'THROTTLED' || snapshot.data_health.status === 'DEGRADED') return 'CONDITIONAL';
    return 'GO';
  }, [snapshot]);

  const goNoGoColor = goNoGoStatus === 'GO' ? 'emerald' : goNoGoStatus === 'CONDITIONAL' ? 'amber' : 'red';

  // Tailwind JIT requires full class names — cannot use string interpolation
  const goNoGoClasses = {
    emerald: { badge: 'border-emerald-500/60 bg-emerald-500/10', text: 'text-emerald-400' },
    amber:   { badge: 'border-amber-500/60 bg-amber-500/10',     text: 'text-amber-400' },
    red:     { badge: 'border-red-500/60 bg-red-500/10',         text: 'text-red-400' },
  }[goNoGoColor];

  if (!mounted || acknowledged) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0F172A] px-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="text-[0.65rem] font-extrabold uppercase tracking-[0.15em] text-slate-500">
            MarketScanner Pros — Institutional Session Briefing
          </div>
          <div className="mt-2 text-2xl font-black text-slate-100">
            Session Start Review
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Review market conditions, risk limits, and overnight changes before proceeding.
          </div>
        </div>

        {/* Go / No-Go Badge */}
        <div className="mb-4 flex justify-center">
          <div className={`rounded-lg border-2 px-6 py-3 text-center ${goNoGoClasses.badge}`}>
            <div className={`text-[0.6rem] font-extrabold uppercase tracking-[0.12em] ${goNoGoClasses.text}`}>
              Session Assessment
            </div>
            <div className={`mt-1 text-xl font-black ${goNoGoClasses.text}`}>
              {goNoGoStatus === 'GO' ? '✅ GO' : goNoGoStatus === 'CONDITIONAL' ? '⚠️ CONDITIONAL' : '🚫 NO-GO'}
            </div>
          </div>
        </div>

        {/* Grid: Regime + Risk + Data + Limits */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Regime */}
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-3">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">Market Regime</div>
            {regimeLoading ? (
              <div className="mt-1 text-xs text-slate-500">Loading...</div>
            ) : regime ? (
              <div className={`mt-1 inline-block rounded border px-2 py-0.5 text-xs font-mono font-bold ${regimeBadgeColor(regime.regime)}`}>
                {regime.regime}
              </div>
            ) : (
              <div className="mt-1 text-xs text-slate-500">Unknown</div>
            )}
            {regime && (
              <div className="mt-1 text-[10px] text-slate-400">
                Risk: {regime.riskLevel} • Sizing: {regime.sizing}
              </div>
            )}
          </div>

          {/* Risk Mode */}
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-3">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">Risk Mode</div>
            {riskLoading ? (
              <div className="mt-1 text-xs text-slate-500">Loading...</div>
            ) : snapshot ? (
              <>
                <div className={`mt-1 text-sm font-black uppercase ${
                  snapshot.risk_mode === 'LOCKED' ? 'text-red-400'
                  : snapshot.risk_mode === 'DEFENSIVE' ? 'text-red-300'
                  : snapshot.risk_mode === 'THROTTLED' ? 'text-amber-400'
                  : 'text-emerald-400'
                }`}>{snapshot.risk_mode}</div>
                <div className="mt-1 text-[10px] text-slate-400">
                  Guard: {snapshot.guard_enabled ? 'ON' : 'OFF'}
                </div>
              </>
            ) : (
              <div className="mt-1 text-xs text-slate-500">N/A</div>
            )}
          </div>

          {/* R Budget */}
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-3">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">Daily R Budget</div>
            {snapshot ? (
              <>
                <div className={`mt-1 text-sm font-black ${snapshot.session.remaining_daily_R <= 0.5 ? 'text-red-400' : 'text-slate-100'}`}>
                  {Number(snapshot.session.remaining_daily_R).toFixed(1)}R / {snapshot.session.max_daily_R}R
                </div>
                <div className="mt-1 text-[10px] text-slate-400">
                  Open Risk: {Number(snapshot.session.open_risk_R).toFixed(1)}R • Losses: {snapshot.session.consecutive_losses}
                </div>
              </>
            ) : (
              <div className="mt-1 text-xs text-slate-500">N/A</div>
            )}
          </div>

          {/* Data Health */}
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-3">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">Data Health</div>
            {snapshot ? (
              <>
                <div className={`mt-1 text-sm font-black ${
                  snapshot.data_health.status === 'DOWN' ? 'text-red-400'
                  : snapshot.data_health.status === 'DEGRADED' ? 'text-amber-400'
                  : 'text-emerald-400'
                }`}>{snapshot.data_health.status}</div>
                <div className="mt-1 text-[10px] text-slate-400">
                  Age: {snapshot.data_health.age_s}s • Source: {snapshot.data_health.source}
                </div>
              </>
            ) : (
              <div className="mt-1 text-xs text-slate-500">N/A</div>
            )}
          </div>
        </div>

        {/* Global Blocks */}
        {snapshot && snapshot.global_blocks.length > 0 && (
          <div className="mt-3">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500 mb-2">Active Blocks & Warnings</div>
            <div className="space-y-1">
              {snapshot.global_blocks.map((block, i) => (
                <div key={i} className={`rounded-md border px-3 py-2 text-xs ${
                  block.severity === 'BLOCK'
                    ? 'border-red-500/40 bg-red-500/10 text-red-300'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                }`}>
                  <span className="font-mono font-semibold">{block.code}</span>: {block.msg}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Acknowledgment */}
        <div className="mt-6 text-center">
          <button
            disabled={!canAcknowledge}
            onClick={handleAcknowledge}
            className={`rounded-lg border px-8 py-3 text-sm font-extrabold uppercase tracking-[0.08em] transition-all ${
              canAcknowledge
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 cursor-pointer'
                : 'border-slate-700 bg-slate-800/50 text-slate-500 cursor-not-allowed'
            }`}
          >
            {canAcknowledge
              ? 'I Have Reviewed — Begin Session'
              : `Review for ${MIN_DISPLAY_SECONDS - displayTime}s more...`}
          </button>
          <div className="mt-2 text-[10px] text-slate-500">
            This briefing is mandatory at session start. All actions are logged.
          </div>
        </div>
      </div>
    </div>
  );
}
