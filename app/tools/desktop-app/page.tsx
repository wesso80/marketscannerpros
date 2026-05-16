'use client';

import { useEffect, useMemo, useState } from 'react';
import ComplianceDisclaimer from '@/components/ComplianceDisclaimer';
import MarketPulseHero from '@/components/MarketPulseHero';
import DerivativesWidget from '@/components/DerivativesWidget';
import OpenInterestWidget from '@/components/OpenInterestWidget';
import MarketOverviewWidget from '@/components/MarketOverviewWidget';
import TrendingCoinsWidget from '@/components/TrendingCoinsWidget';
import DefiStatsWidget from '@/components/DefiStatsWidget';

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
        <header className="rounded-xl border border-emerald-400/20 bg-[linear-gradient(120deg,rgba(15,23,42,0.98),rgba(6,12,22,0.98))] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-emerald-300">
                Isolated Desktop Workspace
              </div>
              <h1 className="mt-1 text-2xl font-black text-white md:text-3xl">
                MSP Desktop App Lab
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-300">
                This screen is isolated from your existing dashboard routes and navigation.
                Use it as a desktop-style workspace prototype.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              <div className="rounded-lg border border-white/10 bg-slate-950/35 px-3 py-2">
                <div className="text-slate-500">Visible Panels</div>
                <div className="mt-0.5 text-lg font-black text-emerald-300">{visibleCount}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-slate-950/35 px-3 py-2">
                <div className="text-slate-500">Layout Mode</div>
                <div className="mt-0.5 text-lg font-black text-sky-300">
                  {layout.compactMode ? 'Compact' : 'Expanded'}
                </div>
              </div>
              <button
                type="button"
                onClick={resetLayout}
                className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-left text-amber-200 transition hover:bg-amber-400/15"
              >
                <div className="text-[10px] uppercase tracking-[0.12em] text-amber-300">Action</div>
                <div className="mt-0.5 font-bold">Reset Layout</div>
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setLayout((prev) => ({ ...prev, compactMode: !prev.compactMode }))}
              className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-emerald-200 hover:bg-emerald-400/15"
            >
              Toggle Compact Mode
            </button>
            {Object.entries(PANEL_LABELS).map(([id, label]) => {
              const panelId = id as PanelId;
              const hidden = layout.hidden[panelId];
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => togglePanel(panelId)}
                  className={`rounded-md border px-2.5 py-1.5 text-[11px] font-bold ${
                    hidden
                      ? 'border-slate-600 bg-slate-800/40 text-slate-400'
                      : 'border-sky-400/30 bg-sky-400/10 text-sky-200'
                  }`}
                >
                  {hidden ? 'Show' : 'Hide'} {label}
                </button>
              );
            })}
          </div>
        </header>

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
