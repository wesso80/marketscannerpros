'use client';

import { useState } from 'react';
import type { TickerTab, TickerContext } from './types';
import OverviewTab from './tabs/OverviewTab';
import StructureTab from './tabs/StructureTab';
import OptionsTab from './tabs/OptionsTab';
import FlowTab from './tabs/FlowTab';
import NewsTab from './tabs/NewsTab';
import TimeTab from './tabs/TimeTab';

const TABS: { key: TickerTab; label: string; cryptoLabel?: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'structure', label: 'Structure' },
  { key: 'options', label: 'Options', cryptoLabel: 'Derivatives' },
  { key: 'flow', label: 'Flow' },
  { key: 'news', label: 'News & Events' },
  { key: 'time', label: 'Time' },
];

interface TickerTabsProps {
  ctx: TickerContext;
}

/**
 * TickerTabs — 6-tab deep-dive into any selected ticker.
 * Each tab absorbs functionality from what were previously separate pages.
 */
export default function TickerTabs({ ctx }: TickerTabsProps) {
  const [activeTab, setActiveTab] = useState<TickerTab>('overview');

  if (!ctx.symbol) {
    return null;
  }

  return (
    <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-card)]">
      {/* Tab bar */}
      <div className="flex items-center gap-0.5 overflow-x-auto border-b border-[var(--msp-border)] px-2 py-1">
        {TABS.map(({ key, label, cryptoLabel }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`whitespace-nowrap rounded-t-md px-3 py-1.5 text-[11px] font-semibold transition-colors ${
              activeTab === key
                ? 'border-b-2 border-[var(--msp-accent)] text-[var(--msp-accent)] bg-[var(--msp-accent-glow)]'
                : 'text-[var(--msp-text-muted)] hover:text-[var(--msp-text)]'
            }`}
          >
            {ctx.assetClass === 'crypto' && cryptoLabel ? cryptoLabel : label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-3">
        {activeTab === 'overview' && <OverviewTab ctx={ctx} />}
        {activeTab === 'structure' && <StructureTab ctx={ctx} />}
        {activeTab === 'options' && <OptionsTab ctx={ctx} />}
        {activeTab === 'flow' && <FlowTab ctx={ctx} />}
        {activeTab === 'news' && <NewsTab ctx={ctx} />}
        {activeTab === 'time' && <TimeTab ctx={ctx} />}
      </div>
    </div>
  );
}
