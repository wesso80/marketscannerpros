'use client';

/* ---------------------------------------------------------------------------
   SURFACE 6: WORKSPACE — Watchlists, Journal, Portfolio, Settings
   Real APIs: /api/watchlists, /api/journal, links to v1 portfolio & settings
   --------------------------------------------------------------------------- */

import { Suspense, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Card, UpgradeGate } from '@/app/v2/_components/ui';
import { PageHero } from '@/components/ui';
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

function WorkspaceMetric({ label, value, tone = 'var(--msp-text)', detail }: { label: string; value: string; tone?: string; detail: string }) {
  return (
    <div style={{ background: 'var(--msp-card-2)', borderRadius: 'var(--msp-radius-card)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4, minHeight: '3.5rem' }}>
      <div style={{ fontSize: 'var(--msp-text-label)', fontWeight: 500, color: 'var(--msp-text-muted)' }}>{label}</div>
      <div style={{ fontSize: 'var(--msp-text-h2)', fontWeight: 500, color: tone, fontVariantNumeric: 'tabular-nums', lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={value}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--msp-text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={detail}>{detail}</div>
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
              style={{
                background: isActive ? 'var(--msp-accent-tint)' : 'var(--msp-card-2)',
                borderLeft: isActive ? '2px solid var(--msp-accent)' : '2px solid transparent',
                borderRadius: 'var(--msp-radius-control)',
                padding: '6px 12px',
                textAlign: 'left',
              }}
              className="transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
            >
              <div style={{ fontSize: 'var(--msp-text-label)', fontWeight: 500, color: 'var(--msp-text-muted)' }}>{meta.eyebrow}</div>
              <div style={{ marginTop: 2, fontSize: 'var(--msp-text-body)', fontWeight: 500, color: isActive ? 'var(--msp-accent)' : 'var(--msp-text)' }}>{t}</div>
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
  const tierTone: 'bull' | 'info' | 'neutral' = tier === 'pro_trader' ? 'bull' : tier === 'pro' ? 'info' : 'neutral';
  const nextTab: WorkspaceTab = (() => {
    const idx = TABS.indexOf(tab);
    return TABS[(idx + 1) % TABS.length];
  })();

  return (
    <div className="space-y-3">
      <PageHero
        ariaLabel="Workspace command header"
        eyebrow="Workflow memory"
        badges={[
          { label: activeMeta.eyebrow },
          { label: `Tier ${tierLabel}` },
        ]}
        title="Workspace"
        subtitle="Watchlists, journal, portfolio, learning, backtest, alerts, and account settings in one compact workbench."
        actions={[
          { label: 'Open watchlists', variant: 'primary', onClick: () => setTab('Watchlists') },
          { label: `Open ${nextTab}`, variant: 'secondary', onClick: () => setTab(nextTab) },
          { label: 'Open workflow', variant: 'ghost', href: '/tools/workflow' },
        ]}
        metrics={[
          { label: 'Active tab', value: tab, tone: 'bull', detail: activeMeta.eyebrow },
          { label: 'Tier', value: tierLabel, tone: tierTone, detail: 'Subscription level' },
          { label: 'Focus', value: activeMeta.eyebrow.replace(/^\d+\.\s*/, ''), tone: 'info', detail: 'Current workbench focus' },
          { label: 'Next tab', value: nextTab, tone: 'info', detail: 'Continue the workspace loop' },
        ]}
      />

      <WorkspaceTabRail activeTab={tab} onSelectTab={setTab} />

      {/* -- WATCHLISTS ----------------------------------------------- */}
      {tab === 'Watchlists' && <RiskPermissionProvider><WatchlistWidget /></RiskPermissionProvider>}

      {/* -- JOURNAL -------------------------------------------------- */}
      {tab === 'Journal' && (
        <UpgradeGate requiredTier="pro" currentTier={tier} feature="Trade Journal">
          <JournalPageV1 tier={tier} embeddedInWorkspace />
        </UpgradeGate>
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
        <UpgradeGate requiredTier="pro_trader" currentTier={tier} feature="Backtest Engine">
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
