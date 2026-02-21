'use client';

import ToolsPageHeader from '@/components/ToolsPageHeader';
import { useRiskPermission } from '@/components/risk/RiskPermissionContext';

export default function ToolsSettingsPage() {
  const { guardEnabled, setGuardEnabled, snapshot, loading } = useRiskPermission();

  return (
    <div className="min-h-screen bg-[var(--msp-bg)]">
      <ToolsPageHeader
        badge="TOOLS SETTINGS"
        title="Settings"
        subtitle="Configure educational guardrails and platform behavior for your workspace."
        icon="⚙️"
        backHref="/tools"
      />

      <main className="mx-auto w-full max-w-none px-4 py-6 md:px-6">
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
      </main>
    </div>
  );
}
