'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   SURFACE 6: WORKSPACE — Watchlists, Journal, Portfolio, Settings
   Real APIs: /api/watchlists, /api/journal, links to v1 portfolio & settings
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Card, SectionHeader } from '../_components/ui';
import { RiskPermissionProvider } from '@/components/risk/RiskPermissionContext';

const WatchlistWidget = dynamic(() => import('@/components/WatchlistWidget'), { ssr: false, loading: () => <div className="animate-pulse bg-slate-800/50 rounded-xl h-64" /> });
const JournalPageV1 = dynamic(() => import('@/components/journal/JournalPage'), { ssr: false, loading: () => <div className="animate-pulse bg-slate-800/50 rounded-xl h-64" /> });

const TABS = ['Watchlists', 'Journal', 'Portfolio', 'Settings'] as const;

export default function WorkspacePage() {
  const [tab, setTab] = useState<typeof TABS[number]>('Watchlists');

  return (
    <div className="space-y-4">
      <SectionHeader title="Workspace" subtitle="Your personal trading workspace" />

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition-colors ${tab === t ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:bg-slate-800/60 border border-transparent'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* ── WATCHLISTS ─────────────────────────────────────────────── */}
      {tab === 'Watchlists' && <RiskPermissionProvider><WatchlistWidget /></RiskPermissionProvider>}

      {/* ── JOURNAL ────────────────────────────────────────────────── */}
      {tab === 'Journal' && <JournalPageV1 tier="pro_trader" />}

      {/* ── PORTFOLIO ──────────────────────────────────────────────── */}
      {tab === 'Portfolio' && (
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3">Portfolio Tracker</h3>
          <div className="text-center py-12">
            <div className="text-slate-500 text-xs mb-4">
              Portfolio management is available in the full platform.
            </div>
            <a
              href="/tools/portfolio"
              target="_blank"
              className="px-4 py-2 text-xs rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 transition-colors inline-block"
            >
              Open Portfolio Tracker →
            </a>
          </div>
        </Card>
      )}

      {/* ── SETTINGS ───────────────────────────────────────────────── */}
      {tab === 'Settings' && (
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3">Workspace Settings</h3>
          <div className="text-center py-12">
            <div className="text-slate-500 text-xs mb-4">
              Account settings and preferences are managed in the main dashboard.
            </div>
            <a
              href="/account"
              target="_blank"
              className="px-4 py-2 text-xs rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 transition-colors inline-block"
            >
              Open Account Settings →
            </a>
          </div>
        </Card>
      )}
    </div>
  );
}
