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
  const initialTab = TABS.find(t => t.toLowerCase() === searchParams.get('tab')?.toLowerCase()) || 'Watchlists';
  const [tab, setTab] = useState<typeof TABS[number]>(initialTab);

  useEffect(() => {
    const requestedTab = TABS.find(t => t.toLowerCase() === searchParams.get('tab')?.toLowerCase());
    if (requestedTab && requestedTab !== tab) setTab(requestedTab);
  }, [searchParams, tab]);

  return (
    <div className="space-y-3">
      <Card>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div>
            <div className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-emerald-300">Workflow memory</div>
            <h1 className="mt-1 text-xl font-black tracking-normal text-white md:text-2xl">Workspace</h1>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">Watchlists, journal, portfolio, learning, backtest, alerts, and account settings in one compact workbench.</p>
          </div>
          <div className="rounded-md border border-slate-700/70 bg-slate-950/60 px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-slate-500">
            {tab} tab
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-2">
        <div className="flex items-center gap-1 overflow-x-auto">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} className={`shrink-0 rounded-md border px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap transition-colors ${tab === t ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300' : 'border-slate-800 bg-slate-950/35 text-slate-400 hover:border-slate-600 hover:text-slate-200'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

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
