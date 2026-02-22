'use client';

import { useState } from 'react';
import {
  InstitutionalStateStrip,
  MarketsToolbar,
  DecisionLens,
  TickerTabs,
  RightRail,
  useTickerData,
} from '@/components/markets';
import type { AssetClass } from '@/components/markets/types';

/**
 * Unified Markets Page
 *
 * "Fewer doors, same power."
 * Absorbs: Equity Explorer, Crypto Explorer, Derivatives, Options, News,
 *          Economic Calendar, Time Confluence — into one institutional cockpit.
 *
 * Architecture:
 *   ┌────────────────────────────────────────────────────────┐
 *   │ InstitutionalStateStrip (sticky)                       │
 *   ├────────────────────────────────────────────────────────┤
 *   │ MarketsToolbar (asset toggle + search)                 │
 *   ├──────────────────────────────┬─────────────────────────┤
 *   │ DecisionLens (3-col)        │ RightRail               │
 *   ├──────────────────────────────┤  • QuickStats           │
 *   │ TickerTabs (6 tabs)         │  • TradePreview          │
 *   │  • Overview                 │  • SectorHeatmap         │
 *   │  • Structure                │  • Watchlist             │
 *   │  • Options                  │                          │
 *   │  • Flow                     │                          │
 *   │  • News & Events            │                          │
 *   │  • Time                     │                          │
 *   └──────────────────────────────┴─────────────────────────┘
 */
export default function MarketsPage() {
  const [assetClass, setAssetClass] = useState<AssetClass>('equities');
  const [symbol, setSymbol] = useState<string>('');

  const ctx = useTickerData(symbol || null, assetClass);

  return (
    <div className="min-h-screen bg-[var(--msp-bg)] px-2 py-3 text-slate-100 md:px-3">
      <div className="mx-auto grid w-full max-w-none gap-2">
        {/* 1. Institutional State Strip — sticky regime/risk/R-budget bar */}
        <InstitutionalStateStrip />

        {/* 2. Toolbar — asset class toggle + unified ticker search */}
        <MarketsToolbar
          assetClass={assetClass}
          onAssetClassChange={setAssetClass}
          symbol={symbol}
          onSymbolChange={setSymbol}
        />

        {/* 3. Main content: Decision Lens + Tabs (left) + Right Rail */}
        <div className="grid gap-2 xl:grid-cols-[1fr_320px]">
          {/* Left column — Decision Lens on top, TickerTabs below */}
          <div className="grid gap-2">
            <DecisionLens ctx={ctx} />
            <TickerTabs ctx={ctx} />
          </div>

          {/* Right rail — contextual support */}
          <aside className="hidden xl:block">
            <div className="sticky top-[52px]">
              <RightRail ctx={ctx} />
            </div>
          </aside>
        </div>

        {/* Mobile right rail — stacked below on smaller screens */}
        <div className="xl:hidden">
          <RightRail ctx={ctx} />
        </div>
      </div>
    </div>
  );
}
