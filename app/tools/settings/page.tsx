'use client';

import { useState } from 'react';
import ToolsPageHeader from '@/components/ToolsPageHeader';
import { useRiskPermission } from '@/components/risk/RiskPermissionContext';
import { useRegime, regimeLabel, regimeBadgeColor } from '@/lib/useRegime';

export default function ToolsSettingsPage() {
  const { guardEnabled, setGuardEnabled, snapshot, loading } = useRiskPermission();
  const { data: regime, loading: regimeLoading } = useRegime();

  return (
    <div className="min-h-screen bg-[var(--msp-bg)]">
      <ToolsPageHeader
        badge="TOOLS SETTINGS"
        title="Settings"
        subtitle="Configure educational guardrails and platform behavior for your workspace."
        icon="⚙️"
        backHref="/tools"
      />

      <main className="mx-auto w-full max-w-none space-y-6 px-4 py-6 md:px-6">

        {/* ─── Section 1: Risk Guard Toggle ─── */}
        <section className="rounded-xl border border-slate-700 bg-slate-900/50 p-4 md:p-5">
          <div className="mb-4">
            <h2 className="text-base font-bold text-slate-100">Education Risk Guard</h2>
            <p className="mt-1 text-xs text-slate-400">
              Educational guardrails only — no brokerage execution, no investment advice.
            </p>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">Rule Guard Toggle</div>
                <div className="mt-1 text-xs text-slate-400">
                  When ON, rule compliance is enforced across scanner, alerts, watchlists, journal, and portfolio actions.
                </div>
              </div>

              <button
                disabled={loading}
                onClick={() => {
                  void setGuardEnabled(!guardEnabled);
                }}
                className={`rounded-md border px-3 py-2 text-xs font-semibold uppercase tracking-[0.06em] disabled:opacity-50 ${
                  guardEnabled
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                    : 'border-slate-600 bg-slate-800 text-slate-300'
                }`}
              >
                {guardEnabled ? 'ON' : 'OFF'}
              </button>
            </div>

            <div className="mt-3 grid gap-2 text-xs text-slate-300 md:grid-cols-3">
              <div className="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Current State</div>
                <div className="mt-1 font-semibold text-slate-100">{guardEnabled ? 'Rule Guard ON' : 'Rule Guard OFF'}</div>
              </div>
              <div className="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Risk Mode</div>
                <div className="mt-1 font-semibold text-slate-100">{snapshot?.risk_mode || 'N/A'}</div>
              </div>
              <div className="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Data Health</div>
                <div className="mt-1 font-semibold text-slate-100">{snapshot?.data_health.status || 'N/A'}</div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Section 2: Regime Status ─── */}
        <section className="rounded-xl border border-slate-700 bg-slate-900/50 p-4 md:p-5">
          <div className="mb-4">
            <h2 className="text-base font-bold text-slate-100">Unified Regime Status</h2>
            <p className="mt-1 text-xs text-slate-400">
              Real-time market regime from aggregated signals. Updates every 30 seconds.
            </p>
          </div>

          {regimeLoading ? (
            <div className="text-xs text-slate-500">Loading regime...</div>
          ) : regime ? (
            <div className="grid gap-2 text-xs md:grid-cols-4">
              <div className="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Regime</div>
                <div className={`mt-1 inline-block rounded border px-2 py-0.5 font-mono font-semibold ${regimeBadgeColor(regime.regime)}`}>
                  {regimeLabel(regime.regime)}
                </div>
              </div>
              <div className="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Risk Level</div>
                <div className="mt-1 font-semibold text-slate-100">{regime.riskLevel.toUpperCase()}</div>
              </div>
              <div className="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Permission</div>
                <div className="mt-1 font-semibold text-slate-100">{regime.permission}</div>
              </div>
              <div className="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Position Sizing</div>
                <div className="mt-1 font-semibold text-slate-100">{regime.sizing}</div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500">No regime data available</div>
          )}

          {regime && regime.signals.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-[0.08em] text-slate-500 mb-2">Signal Sources</div>
              <div className="space-y-1">
                {regime.signals.map((sig, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-400">
                    <span className={`h-1.5 w-1.5 rounded-full ${sig.stale ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                    <span className="font-mono">{sig.source}</span>
                    <span className="text-slate-600">→</span>
                    <span>{sig.regime}</span>
                    <span className="text-slate-600">(weight: {sig.weight})</span>
                    {sig.stale && <span className="text-amber-500 text-[10px]">STALE</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ─── Section 3: Risk Caps ─── */}
        {snapshot && (
          <section className="rounded-xl border border-slate-700 bg-slate-900/50 p-4 md:p-5">
            <div className="mb-4">
              <h2 className="text-base font-bold text-slate-100">Risk Caps & Session Limits</h2>
              <p className="mt-1 text-xs text-slate-400">
                Current risk parameters enforced by the risk governor.
              </p>
            </div>

            <div className="grid gap-2 text-xs md:grid-cols-3 lg:grid-cols-5">
              <div className="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Risk Per Trade</div>
                <div className="mt-1 font-semibold text-slate-100">{((snapshot.caps.risk_per_trade || 0) * 100).toFixed(2)}%</div>
              </div>
              <div className="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Daily R Remaining</div>
                <div className="mt-1 font-semibold text-slate-100">{snapshot.session.remaining_daily_R.toFixed(1)} / {snapshot.session.max_daily_R}</div>
              </div>
              <div className="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Open Risk</div>
                <div className="mt-1 font-semibold text-slate-100">{snapshot.session.open_risk_R.toFixed(1)}R / {snapshot.session.max_open_risk_R}R</div>
              </div>
              <div className="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Consecutive Losses</div>
                <div className="mt-1 font-semibold text-slate-100">{snapshot.session.consecutive_losses}</div>
              </div>
              <div className="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Add-Ons</div>
                <div className="mt-1 font-semibold text-slate-100">{snapshot.caps.add_ons_allowed ? 'Allowed' : 'Blocked'}</div>
              </div>
            </div>

            {snapshot.global_blocks.length > 0 && (
              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-[0.08em] text-slate-500 mb-2">Active Blocks</div>
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
          </section>
        )}

        {/* ─── Section 4: Platform Info ─── */}
        <section className="rounded-xl border border-slate-700 bg-slate-900/50 p-4 md:p-5">
          <div className="mb-4">
            <h2 className="text-base font-bold text-slate-100">Platform Information</h2>
            <p className="mt-1 text-xs text-slate-400">
              Technical details about your workspace and platform version.
            </p>
          </div>

          <div className="grid gap-2 text-xs md:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Platform</div>
              <div className="mt-1 font-semibold text-slate-100">MarketScanner Pros</div>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Version</div>
              <div className="mt-1 font-semibold text-slate-100">v3.0</div>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Data Source</div>
              <div className="mt-1 font-semibold text-slate-100">Alpha Vantage (delayed)</div>
            </div>
          </div>

          <div className="mt-3 rounded-md border border-slate-700 bg-slate-950/40 p-3 text-xs text-slate-500">
            Educational and analytical tool only. All market data is delayed. No brokerage execution or investment advice.
            All trading decisions, risk, and compliance are the sole responsibility of the user. See{' '}
            <a href="/disclaimer" className="text-emerald-400 underline">Disclaimer</a> and{' '}
            <a href="/terms" className="text-emerald-400 underline">Terms of Service</a>.
          </div>
        </section>
      </main>
    </div>
  );
}
