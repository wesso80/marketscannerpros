'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   SURFACE 6: WORKSPACE — Watchlists, Journal, Portfolio, Settings
   Real APIs: /api/watchlists, /api/journal, links to v1 portfolio & settings
   ═══════════════════════════════════════════════════════════════════════════ */

import { Suspense, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Card, SectionHeader, UpgradeGate } from '@/app/v2/_components/ui';
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

  return (
    <div className="space-y-6">
      <SectionHeader title="Workspace" subtitle="Your personal trading workspace" />

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-2.5 py-1 text-[11px] font-semibold rounded-full whitespace-nowrap transition-colors ${tab === t ? 'bg-[rgba(16,185,129,0.1)] text-[var(--msp-accent)] border border-[rgba(16,185,129,0.4)]' : 'text-[var(--msp-text-muted)] hover:bg-slate-800/60 border border-transparent'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* ── WATCHLISTS ─────────────────────────────────────────────── */}
      {tab === 'Watchlists' && <RiskPermissionProvider><WatchlistWidget /></RiskPermissionProvider>}

      {/* ── JOURNAL ────────────────────────────────────────────────── */}
      {tab === 'Journal' && (
        <UpgradeGate requiredTier="pro" currentTier={tier} feature="Trade Journal">
          <JournalPageV1 tier={tier} />
        </UpgradeGate>
      )}

      {/* ── PORTFOLIO ──────────────────────────────────────────────── */}
      {tab === 'Portfolio' && <RiskPermissionProvider><PortfolioV1 /></RiskPermissionProvider>}

      {/* ── LEARNING ───────────────────────────────────────────────── */}
      {tab === 'Learning' && (
        <UpgradeGate requiredTier="pro" currentTier={tier} feature="Doctrine Learning">
          <LearningTab />
        </UpgradeGate>
      )}

      {/* ── BACKTEST ───────────────────────────────────────────────── */}
      {tab === 'Backtest' && (
        <UpgradeGate requiredTier="pro_trader" currentTier={tier} feature="Backtest Engine">
          <BacktestPage />
        </UpgradeGate>
      )}

      {/* ── ALERTS ─────────────────────────────────────────────────── */}
      {tab === 'Alerts' && <RiskPermissionProvider><AlertsContentV1 /></RiskPermissionProvider>}

      {/* ── SETTINGS / ACCOUNT ────────────────────────────────────── */}
      {tab === 'Settings' && <AccountSection />}
    </div>
  );
}
