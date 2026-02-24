'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRiskPermission } from '@/components/risk/RiskPermissionContext';
import { useRegime, regimeBadgeColor } from '@/lib/useRegime';

/**
 * Risk Manager Mode — Institutional risk-only view.
 * Strips away signal generation and shows only:
 * - Exposure (open risk, gross/net/cluster)
 * - P&L (session R, daily R budget)
 * - Regime (current + confidence)
 * - Kill switches (lock, guard toggle, emergency flatten)
 */
export default function RiskManagerMode({ onExit }: { onExit?: () => void } = {}) {
  const { snapshot, guardEnabled, setGuardEnabled, isLocked, guardPendingDisable } = useRiskPermission();
  const { data: regime } = useRegime();
  const [portfolioData, setPortfolioData] = useState<any>(null);
  const [collapsed, setCollapsed] = useState(!onExit); // auto-collapse when embedded

  useEffect(() => {
    async function loadPortfolio() {
      try {
        const res = await fetch('/api/portfolio?view=summary', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setPortfolioData(data);
        }
      } catch {}
    }
    void loadPortfolio();
    const interval = window.setInterval(() => { void loadPortfolio(); }, 15_000);
    return () => window.clearInterval(interval);
  }, []);

  const handleEmergencyLock = useCallback(async () => {
    if (!confirm('EMERGENCY LOCK: This will disable all new trades immediately. Are you sure?')) return;
    await setGuardEnabled(true); // Ensure guard is on
    // The system will enforce LOCK through the governor
  }, [setGuardEnabled]);

  if (!snapshot) {
    return (
      <div className="msp-elite-panel flex items-center justify-center py-8">
        <div className="text-slate-500 text-sm">Loading risk state...</div>
      </div>
    );
  }

  // Embedded mode: collapsible panel instead of full-screen overlay
  if (!onExit && collapsed) {
    return (
      <div className="msp-elite-panel">
        <button
          onClick={() => setCollapsed(false)}
          className="flex w-full items-center justify-between text-left"
        >
          <div className="text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-red-400/60">
            Risk Manager Mode
          </div>
          <span className="text-[0.65rem] text-slate-500">▼ Expand</span>
        </button>
      </div>
    );
  }

  const riskModeColors: Record<string, string> = {
    NORMAL: 'text-emerald-400 border-emerald-500/40',
    THROTTLED: 'text-amber-400 border-amber-500/40',
    DEFENSIVE: 'text-red-300 border-red-500/40',
    LOCKED: 'text-red-500 border-red-500/60 animate-pulse',
  };

  return (
    <div className={onExit ? 'min-h-screen bg-[#0A0F1A] px-4 py-6' : 'msp-elite-panel'}>
      {/* Header */}
      <div className={onExit ? 'mx-auto max-w-5xl' : ''}>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-[0.6rem] font-extrabold uppercase tracking-[0.15em] text-red-400/60">
              Risk Manager Mode — Signal Generation Disabled
            </div>
            {onExit && (
              <div className="mt-1 text-xl font-black text-slate-100">
                Risk & Exposure Dashboard
              </div>
            )}
          </div>
          <button
            onClick={onExit ?? (() => setCollapsed(true))}
            className="rounded-md border border-slate-600 bg-slate-800 px-4 py-2 text-xs font-bold uppercase text-slate-300 hover:bg-slate-700"
          >
            {onExit ? 'Exit Risk Mode' : '▲ Collapse'}
          </button>
        </div>

        {/* Risk Mode Banner */}
        <div className={`mb-4 rounded-xl border-2 p-4 text-center ${riskModeColors[snapshot.risk_mode] ?? 'border-slate-600 text-slate-400'}`}>
          <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Current Risk Mode</div>
          <div className="mt-1 text-3xl font-black">{snapshot.risk_mode}</div>
          {snapshot.risk_mode === 'LOCKED' && (
            <div className="mt-1 text-xs text-red-400">All new trades are blocked. Manage exits only.</div>
          )}
        </div>

        {/* Grid: Exposure + P&L + Regime + Controls */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Exposure Panel */}
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
            <div className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">Exposure Profile</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-slate-700 bg-slate-950/40 px-3 py-2">
                <div className="text-[9px] uppercase text-slate-500">Open Risk</div>
                <div className="mt-1 text-lg font-black text-slate-100">{Number(snapshot.session.open_risk_R).toFixed(1)}R</div>
                <div className="text-[10px] text-slate-500">Max: {snapshot.session.max_open_risk_R}R</div>
              </div>
              <div className="rounded-md border border-slate-700 bg-slate-950/40 px-3 py-2">
                <div className="text-[9px] uppercase text-slate-500">Remaining Daily R</div>
                <div className={`mt-1 text-lg font-black ${snapshot.session.remaining_daily_R <= 0.5 ? 'text-red-400' : 'text-slate-100'}`}>
                  {Number(snapshot.session.remaining_daily_R).toFixed(1)}R
                </div>
                <div className="text-[10px] text-slate-500">Budget: {snapshot.session.max_daily_R}R</div>
              </div>
              <div className="rounded-md border border-slate-700 bg-slate-950/40 px-3 py-2">
                <div className="text-[9px] uppercase text-slate-500">Gross Max</div>
                <div className="mt-1 text-lg font-black text-slate-100">{snapshot.caps.gross_max}</div>
              </div>
              <div className="rounded-md border border-slate-700 bg-slate-950/40 px-3 py-2">
                <div className="text-[9px] uppercase text-slate-500">Cluster Max</div>
                <div className="mt-1 text-lg font-black text-slate-100">{snapshot.caps.cluster_max}</div>
              </div>
              <div className="rounded-md border border-slate-700 bg-slate-950/40 px-3 py-2">
                <div className="text-[9px] uppercase text-slate-500">Trades Today</div>
                <div className={`mt-1 text-lg font-black ${snapshot.session.trade_count_blocked ? 'text-red-400' : 'text-slate-100'}`}>
                  {snapshot.session.trades_today}/{snapshot.session.max_trades_per_day}
                </div>
              </div>
              <div className="rounded-md border border-slate-700 bg-slate-950/40 px-3 py-2">
                <div className="text-[9px] uppercase text-slate-500">Consecutive Losses</div>
                <div className={`mt-1 text-lg font-black ${snapshot.session.consecutive_losses >= 3 ? 'text-red-400' : 'text-slate-100'}`}>
                  {snapshot.session.consecutive_losses}
                </div>
              </div>
            </div>
          </div>

          {/* Regime Panel */}
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
            <div className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">Market Regime</div>
            {regime ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className={`rounded border px-3 py-1 text-sm font-mono font-bold ${regimeBadgeColor(regime.regime)}`}>
                    {regime.regime}
                  </div>
                  <div className="text-xs text-slate-400">
                    Risk: {regime.riskLevel} • {regime.sizing}
                  </div>
                </div>
                <div className="text-xs text-slate-400">
                  Permission: {regime.permission}
                </div>
                {regime.signals.length > 0 && (
                  <div className="space-y-1">
                    {regime.signals.map((sig, i) => (
                      <div key={i} className="flex items-center gap-2 text-[10px] text-slate-500">
                        <span className={`h-1.5 w-1.5 rounded-full ${sig.stale ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                        <span className="font-mono">{sig.source}</span>
                        <span>→ {sig.regime}</span>
                        {sig.stale && <span className="text-amber-400">STALE</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-slate-500">No regime data</div>
            )}
          </div>
        </div>

        {/* Data Health */}
        <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <div className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">Data Health & Infrastructure</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-md border border-slate-700 bg-slate-950/40 px-3 py-2">
              <div className="text-[9px] uppercase text-slate-500">Feed Status</div>
              <div className={`mt-1 text-sm font-black ${
                snapshot.data_health.status === 'OK' ? 'text-emerald-400'
                : snapshot.data_health.status === 'DEGRADED' ? 'text-amber-400'
                : 'text-red-400'
              }`}>{snapshot.data_health.status}</div>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-950/40 px-3 py-2">
              <div className="text-[9px] uppercase text-slate-500">Data Age</div>
              <div className="mt-1 text-sm font-black text-slate-100">{snapshot.data_health.age_s}s</div>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-950/40 px-3 py-2">
              <div className="text-[9px] uppercase text-slate-500">Guard</div>
              <div className={`mt-1 text-sm font-black ${guardEnabled ? 'text-emerald-400' : 'text-red-400'}`}>
                {guardPendingDisable ? 'DISABLING...' : guardEnabled ? 'ON' : 'OFF'}
              </div>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-950/40 px-3 py-2">
              <div className="text-[9px] uppercase text-slate-500">Add-Ons</div>
              <div className={`mt-1 text-sm font-black ${snapshot.caps.add_ons_allowed ? 'text-emerald-400' : 'text-red-400'}`}>
                {snapshot.caps.add_ons_allowed ? 'Allowed' : 'Blocked'}
              </div>
            </div>
          </div>
        </div>

        {/* Global Blocks */}
        {snapshot.global_blocks.length > 0 && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
            <div className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.08em] text-red-400">Active Blocks</div>
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

        {/* Kill Switches */}
        <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <div className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">Kill Switches</div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleEmergencyLock}
              disabled={isLocked}
              className="rounded-md border-2 border-red-500/60 bg-red-500/15 px-4 py-2 text-xs font-extrabold uppercase text-red-300 hover:bg-red-500/25 disabled:opacity-50"
            >
              🚨 Emergency Lock
            </button>
            <button
              onClick={() => void setGuardEnabled(true)}
              disabled={guardEnabled && !guardPendingDisable}
              className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs font-extrabold uppercase text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
            >
              Re-Enable Guard
            </button>
          </div>
        </div>

        {/* Legal */}
        <div className="mt-6 text-center text-[10px] text-slate-600">
          Risk Manager Mode — Educational tool only. Not investment advice. All decisions are the user&apos;s responsibility.
        </div>
      </div>
    </div>
  );
}
