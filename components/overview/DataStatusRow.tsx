import React from 'react';
import MarketStatusStrip, { type MarketStatusItem } from '@/components/market/MarketStatusStrip';
import { dataStatusSummary } from '@/lib/overview/today';
import { COPY } from '@/components/visual/copy';
export default function DataStatusRow({ items }: { items: MarketStatusItem[] }) {
  const counts = dataStatusSummary(items), c = COPY.today;
  return <details data-data-status className="space-y-3 border border-white/10 bg-[var(--msp-panel)] p-4" style={{ borderRadius: 'var(--msp-radius-card)' }}>
    <summary className="cursor-pointer text-xs text-[var(--msp-text-muted)]">
      {c.dataStatus}: {counts.degraded} {c.degraded} · {counts.stale} {c.staleCount} · {counts.notTimed} {c.notTimed}
      <span className="ml-3 text-[var(--msp-accent)]">{c.show}</span>
    </summary>
    <MarketStatusStrip items={items} />
  </details>;
}
