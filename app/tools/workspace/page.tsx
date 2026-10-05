'use client';

/* ---------------------------------------------------------------------------
   SURFACE 6: WORKSPACE — Watchlists, Journal, Portfolio, Settings
   Real APIs: /api/watchlists, /api/journal, links to v1 portfolio & settings
   --------------------------------------------------------------------------- */

import { Suspense, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { UpgradeGate } from '@/app/v2/_components/ui';
import TabBar from '@/components/visual/TabBar';
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

export default function WorkspacePage() {
  return (
    <Suspense fallback={<div className="animate-pulse bg-slate-800/50 rounded-xl h-64" />}>
      <WorkspaceContent />
    </Suspense>
  );
}

function WorkspaceContent() {
  const router = useRouter();
  const { tier, isLoggedIn, isLoading: tierLoading } = useUserTier();
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

  const selectWorkspaceTab = (nextTab: WorkspaceTab) => {
    setTab(nextTab);
    const query = new URLSearchParams(searchParams.toString());
    query.set('tab', nextTab.toLowerCase());
    router.replace(`/tools/workspace?${query}`, { scroll: false });
  };

  // Workspace is per-account memory: without a session there is nothing to show, so say so rather than render a "Free" shell.
  if (!tierLoading && !isLoggedIn) {
    const next = `/tools/workspace${urlTabParam ? `?tab=${encodeURIComponent(urlTabParam)}` : ''}`;
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-white/10 bg-[var(--msp-panel)] p-8 text-center">
        <div className="mb-2 text-sm font-semibold text-amber-300">Sign in required</div>
        <h1 className="text-xl font-bold text-white">Track is tied to your account</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">Watchlists, journal, portfolio, alerts and saved research cases sync across devices once you are signed in.</p>
        <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
          <a href={`/auth?next=${encodeURIComponent(next)}`} className="inline-flex rounded-lg bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/30">Sign In</a>
          <a href="/pricing" className="inline-flex rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-white/20 hover:text-white">See Pricing</a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">Track</h1>
      <TabBar label="Track tabs" items={TABS.map(t => ({ id: t, label: t }))} activeId={tab} onChange={id => selectWorkspaceTab(id as WorkspaceTab)} />

      {/* -- WATCHLISTS ----------------------------------------------- */}
      {tab === 'Watchlists' && <RiskPermissionProvider><WatchlistWidget /></RiskPermissionProvider>}

      {/* -- JOURNAL -------------------------------------------------- */}
      {tab === 'Journal' && (
        <JournalPageV1 tier={tier} embeddedInWorkspace />
      )}

      {/* -- PORTFOLIO ------------------------------------------------ */}
      {tab === 'Portfolio' && <RiskPermissionProvider><PortfolioV1 embeddedInWorkspace /></RiskPermissionProvider>}

      {/* -- LEARNING ------------------------------------------------- */}
      {tab === 'Learning' && (
        <UpgradeGate requiredTier="pro" currentTier={tier} feature="Doctrine Learning">
          <LearningTab />
        </UpgradeGate>
      )}

      {/* -- BACKTEST ------------------------------------------------- */}
      {tab === 'Backtest' && (
        <UpgradeGate requiredTier="pro" currentTier={tier} feature="Backtest Engine">
          <BacktestPage embeddedInWorkspace />
        </UpgradeGate>
      )}

      {/* -- ALERTS --------------------------------------------------- */}
      {tab === 'Alerts' && <RiskPermissionProvider><AlertsContentV1 embeddedInWorkspace /></RiskPermissionProvider>}

      {/* -- SETTINGS / ACCOUNT -------------------------------------- */}
      {tab === 'Settings' && <AccountSection />}
    </div>
  );
}
