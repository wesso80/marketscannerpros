'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   SURFACE 6: WORKSPACE — Watchlists, Journal, Portfolio, Settings
   Real APIs: /api/watchlists, /api/journal, links to v1 portfolio & settings
   ═══════════════════════════════════════════════════════════════════════════ */

import { Suspense, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Card, UpgradeGate } from '@/app/v2/_components/ui';
import { useUserTier } from '@/lib/useUserTier';
import { RiskPermissionProvider } from '@/components/risk/RiskPermissionContext';

const WatchlistWidget = dynamic(() => import('@/components/WatchlistWidget'), { ssr: false, loading: () => <div className="animate-pulse bg-slate-800/50 rounded-xl h-64" /> });
const JournalPageV1 = dynamic(() => import('@/components/journal/JournalPage'), { ssr: false, loading: () => <div className="animate-pulse bg-slate-800/50 rounded-xl h-64" /> });
const PortfolioV1 = dynamic(() => import('@/app/tools/portfolio/page').then(m => ({ default: m.PortfolioContent })), { ssr: false, loading: () => <div className="animate-pulse bg-slate-800/50 rounded-xl h-64" /> });
const AlertsContentV1 = dynamic(() => import('@/app/tools/alerts/page').then(m => ({ default: m.AlertsContent })), { ssr: false, loading: () => <div className="animate-pulse bg-slate-800/50 rounded-xl h-64" /> });
const BacktestPage = dynamic(() => import('@/components/backtest/BacktestHub'), { ssr: false, loading: () => <div className="animate-pulse bg-slate-800/50 rounded-xl h-64" /> });
const AccountSection = dynamic(() => import('./AccountSection'), { ssr: false, loading: () => <div className="animate-pulse bg-slate-800/50 rounded-xl h-64" /> });
const LearningTab = dynamic(() => import('./LearningTab'), { ssr: false, loading: () => <div className="animate-pulse bg-slate-800/50 rounded-xl h-64" /> });

const TABS = ['Watchlists', 'Journal', 'Portfolio', 'Learning', 'Backtest', 'Alerts', 'Settings'] as const;
type WorkspaceTab = typeof TABS[number];

const WORKSPACE_TAB_META: Record<WorkspaceTab, { eyebrow: string; description: string }> = {
  Watchlists: { eyebrow: '1. Symbol shortlist', description: 'Curate the symbols that drive your daily workflow.' },
  Journal: { eyebrow: '2. Trade journal', description: 'Log scenarios, outcomes, and post-trade review notes.' },
  Portfolio: { eyebrow: '3. Open exposure', description: 'Track open positions, P&L, and historical performance.' },
  Learning: { eyebrow: '4. Doctrine', description: 'Review playbooks and lessons captured from prior trades.' },
  Backtest: { eyebrow: '5. Historical test', description: 'Validate the scenario over past data before sizing risk.' },
  Alerts: { eyebrow: '6. Triggers', description: 'Manage price, indicator, and multi-condition alert rules.' },
  Settings: { eyebrow: '7. Account', description: 'Subscription, profile, billing, and preferences.' },
};

function WorkspaceMetric({ label, value, tone = '#CBD5E1', detail }: { label: string; value: string; tone?: string; detail: string }) {
  return (
    <div className="min-h-[3.05rem] rounded-md border border-white/10 bg-slate-950/45 px-3 py-1.5">
      <div className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-0.5 truncate text-sm font-black" style={{ color: tone }} title={value}>{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-slate-500" title={detail}>{detail}</div>
    </div>
  );
}

function WorkspaceTabRail({ activeTab, onSelectTab }: { activeTab: WorkspaceTab; onSelectTab: (tab: WorkspaceTab) => void }) {
  return (
    <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-2" aria-label="Workspace tabs">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
        {TABS.map((t) => {
          const meta = WORKSPACE_TAB_META[t];
          const isActive = activeTab === t;
          return (
            <button
              key={t}
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelectTab(t)}
              className={`rounded-md border px-3 py-1.5 text-left transition ${
                isActive
                  ? 'border-emerald-400/40 bg-emerald-400/10 text-white'
                  : 'border-white/10 bg-white/[0.025] text-slate-300 hover:border-emerald-400/30 hover:bg-emerald-400/[0.05]'
              }`}
            >
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{meta.eyebrow}</div>
              <div className={`mt-0.5 text-sm font-black ${isActive ? 'text-emerald-200' : 'text-white'}`}>{t}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={<div className="animate-pulse bg-slate-800/50 rounded-xl h-64" />}>
      <WorkspaceContent />
    </Suspense>
  );
}

function WorkspaceContent() {
  const { tier } = useUserTier();
  const searchParams = useSearchParams();
  const urlTabParam = searchParams.get('tab')?.toLowerCase() ?? null;
  const initialTab = TABS.find(t => t.toLowerCase() === urlTabParam) || 'Watchlists';
  const [tab, setTab] = useState<typeof TABS[number]>(initialTab);

  // Only re-sync from URL when the URL param itself changes (e.g. external nav).
  // Do NOT depend on `tab` here — that would force user clicks back to the URL value.
  useEffect(() => {
    const requestedTab = TABS.find(t => t.toLowerCase() === urlTabParam);
    if (requestedTab) setTab(requestedTab);
  }, [urlTabParam]);

  const activeMeta = WORKSPACE_TAB_META[tab];
  const tierLabel = tier === 'pro_trader' ? 'Pro Trader' : tier === 'pro' ? 'Pro' : 'Free';
  const tierTone = tier === 'pro_trader' ? '#10B981' : tier === 'pro' ? '#38BDF8' : '#94A3B8';
  const nextTab: WorkspaceTab = (() => {
    const idx = TABS.indexOf(tab);
    return TABS[(idx + 1) % TABS.length];
  })();

  return (
    <div className="space-y-3">
      <section
        className="rounded-lg border border-emerald-400/20 bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(8,13,24,0.98))] p-3 shadow-[0_18px_50px_rgba(0,0,0,0.18)]"
        aria-label="Workspace command header"
      >
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-extrabold uppercase tracking-[0.16em]">
              <span className="text-emerald-300">Workflow memory</span>
              <span className="rounded-md border border-white/10 bg-slate-950/40 px-1.5 py-0.5 text-[0.6rem] tracking-[0.12em] text-slate-400">{activeMeta.eyebrow}</span>
              <span className="rounded-md border border-white/10 bg-slate-950/40 px-1.5 py-0.5 text-[0.6rem] tracking-[0.12em] text-slate-400">Tier {tierLabel}</span>
            </div>
            <h1 className="mt-1 text-xl font-black tracking-normal text-white md:text-2xl">Workspace</h1>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">Watchlists, journal, portfolio, learning, backtest, alerts, and account settings in one compact workbench.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => setTab('Watchlists')} className="rounded-md border border-amber-400/35 bg-amber-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-amber-200 transition-colors hover:bg-amber-400/15">Open Watchlists</button>
              <button type="button" onClick={() => setTab(nextTab)} className="rounded-md border border-emerald-400/35 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-emerald-200 transition-colors hover:bg-emerald-400/15">Open {nextTab}</button>
              <a href="/tools/workflow" className="rounded-md border border-sky-400/35 bg-sky-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-sky-200 no-underline transition-colors hover:bg-sky-400/15">Open Workflow</a>
            </div>
          </div>

          <div className="grid self-start gap-1.5 sm:grid-cols-2">
            <WorkspaceMetric label="Active Tab" value={tab} tone="#10B981" detail={activeMeta.eyebrow} />
            <WorkspaceMetric label="Tier" value={tierLabel} tone={tierTone} detail="Subscription level" />
            <WorkspaceMetric label="Focus" value={activeMeta.eyebrow.replace(/^\d+\.\s*/, '')} tone="#A5B4FC" detail="Current workbench focus" />
            <WorkspaceMetric label="Next Tab" value={nextTab} tone="#38BDF8" detail="Continue the workspace loop" />
          </div>
        </div>
      </section>

      <WorkspaceTabRail activeTab={tab} onSelectTab={setTab} />

      {/* ── WATCHLISTS ─────────────────────────────────────────────── */}
      {tab === 'Watchlists' && <RiskPermissionProvider><WatchlistWidget /></RiskPermissionProvider>}

      {/* ── JOURNAL ────────────────────────────────────────────────── */}
      {tab === 'Journal' && (
        <UpgradeGate requiredTier="pro" currentTier={tier} feature="Trade Journal">
          <JournalPageV1 tier={tier} embeddedInWorkspace />
        </UpgradeGate>
      )}

      {/* ── PORTFOLIO ──────────────────────────────────────────────── */}
      {tab === 'Portfolio' && <RiskPermissionProvider><PortfolioV1 embeddedInWorkspace /></RiskPermissionProvider>}

      {/* ── LEARNING ───────────────────────────────────────────────── */}
      {tab === 'Learning' && (
        <UpgradeGate requiredTier="pro" currentTier={tier} feature="Doctrine Learning">
          <LearningTab />
        </UpgradeGate>
      )}

      {/* ── BACKTEST ───────────────────────────────────────────────── */}
      {tab === 'Backtest' && (
        <UpgradeGate requiredTier="pro_trader" currentTier={tier} feature="Backtest Engine">
          <BacktestPage embeddedInWorkspace />
        </UpgradeGate>
      )}

      {/* ── ALERTS ─────────────────────────────────────────────────── */}
      {tab === 'Alerts' && <RiskPermissionProvider><AlertsContentV1 embeddedInWorkspace /></RiskPermissionProvider>}

      {/* ── SETTINGS / ACCOUNT ────────────────────────────────────── */}
      {tab === 'Settings' && <AccountSection />}
    </div>
  );
}
