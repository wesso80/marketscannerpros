'use client';

import { useEffect, useMemo, useState } from 'react';
import ComplianceDisclaimer from '@/components/ComplianceDisclaimer';
import MarketPulseHero from '@/components/MarketPulseHero';
import DerivativesWidget from '@/components/DerivativesWidget';
import OpenInterestWidget from '@/components/OpenInterestWidget';
import MarketOverviewWidget from '@/components/MarketOverviewWidget';
import TrendingCoinsWidget from '@/components/TrendingCoinsWidget';
import DefiStatsWidget from '@/components/DefiStatsWidget';
import { PageHero } from '@/components/ui';

type PanelId =
  | 'market-pulse'
  | 'market-overview'
  | 'derivatives'
  | 'open-interest'
  | 'trending'
  | 'defi';

type LayoutState = {
  compactMode: boolean;
  hidden: Record<PanelId, boolean>;
};

const STORAGE_KEY = 'msp-desktop-app-layout-v1';

const PANEL_LABELS: Record<PanelId, string> = {
  'market-pulse': 'Market Pulse Hero',
  'market-overview': 'Market Overview',
  derivatives: 'Derivatives Sentiment',
  'open-interest': 'Open Interest',
  trending: 'Trending Coins',
  defi: 'DeFi Stats',
};

const DEFAULT_LAYOUT: LayoutState = {
  compactMode: false,
  hidden: {
    'market-pulse': false,
    'market-overview': false,
    derivatives: false,
    'open-interest': false,
    trending: false,
    defi: false,
  },
};

function readStoredLayout(): LayoutState {
  if (typeof window === 'undefined') return DEFAULT_LAYOUT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<LayoutState>;
    return {
      compactMode: Boolean(parsed.compactMode),
      hidden: { ...DEFAULT_LAYOUT.hidden, ...(parsed.hidden || {}) },
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export default function DesktopAppPage() {
  const [layout, setLayout] = useState<LayoutState>(DEFAULT_LAYOUT);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setLayout(readStoredLayout());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  }, [layout, hydrated]);

  const visibleCount = useMemo(
    () => Object.values(layout.hidden).filter((isHidden) => !isHidden).length,
    [layout.hidden]
  );

  const togglePanel = (panel: PanelId) => {
    setLayout((prev) => ({
      ...prev,
      hidden: {
        ...prev.hidden,
        [panel]: !prev.hidden[panel],
      },
    }));
  };

  const resetLayout = () => setLayout(DEFAULT_LAYOUT);

  return (
    <main className="min-h-screen bg-[#0F172A] text-white">
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <PageHero
          ariaLabel="Desktop App command header"
          eyebrow="Isolated desktop workspace"
          badges={[
            { label: layout.compactMode ? 'Compact mode' : 'Expanded mode' },
            { label: `${visibleCount} visible` },
          ]}
          title="MSP Desktop App Lab"
          subtitle="This screen is isolated from your existing dashboard routes and navigation. Use it as a desktop-style workspace prototype."
          actions={[
            { label: 'Toggle compact mode', variant: 'primary', onClick: () => setLayout((prev) => ({ ...prev, compactMode: !prev.compactMode })) },
            { label: 'Reset layout', variant: 'secondary', onClick: resetLayout },
          ]}
          metrics={[
            { label: 'Visible panels', value: `${visibleCount}`, tone: 'bull', detail: `${Object.keys(PANEL_LABELS).length} total` },
            { label: 'Layout mode', value: layout.compactMode ? 'Compact' : 'Expanded', tone: 'info', detail: 'Density preset' },
            { label: 'Hidden', value: `${Object.keys(PANEL_LABELS).length - visibleCount}`, tone: 'warn', detail: 'Toggled off' },
          ]}
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {Object.entries(PANEL_LABELS).map(([id, label]) => {
            const panelId = id as PanelId;
            const hidden = layout.hidden[panelId];
            return (
              <button
                key={id}
                type="button"
                onClick={() => togglePanel(panelId)}
                className={`rounded-md border px-2.5 py-1.5 text-[11px] font-medium ${
                  hidden
                    ? 'border-[var(--msp-border)] bg-[var(--msp-panel-2)] text-[var(--msp-text-muted)]'
                    : 'border-[var(--msp-accent)]/40 bg-[var(--msp-accent-tint)] text-[var(--msp-accent)]'
                }`}
              >
                {hidden ? 'Show' : 'Hide'} {label}
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          <ComplianceDisclaimer compact />
        </div>

        {!layout.hidden['market-pulse'] && (
          <section className="mt-4 rounded-xl border border-white/10 bg-slate-900/30 p-2">
            <MarketPulseHero />
          </section>
        )}

        <section className="mt-4 grid gap-4 lg:grid-cols-2">
          {!layout.hidden['market-overview'] && (
            <div className="rounded-xl border border-white/10 bg-slate-900/30 p-4">
              <MarketOverviewWidget />
            </div>
          )}

          {!layout.hidden.derivatives && (
            <div className="rounded-xl border border-white/10 bg-slate-900/30 p-4">
              <DerivativesWidget compact={layout.compactMode} />
            </div>
          )}

          {!layout.hidden['open-interest'] && (
            <div className="rounded-xl border border-white/10 bg-slate-900/30 p-4">
              <OpenInterestWidget compact={layout.compactMode} showBreakdown={!layout.compactMode} />
            </div>
          )}

          {!layout.hidden.trending && (
            <div className="rounded-xl border border-white/10 bg-slate-900/30 p-4">
              <TrendingCoinsWidget />
            </div>
          )}

          {!layout.hidden.defi && (
            <div className="rounded-xl border border-white/10 bg-slate-900/30 p-4 lg:col-span-2">
              <DefiStatsWidget />
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
