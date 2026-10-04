import React from 'react';
import StampLine, { type StampLineProps } from './StampLine';
export default function StatCard({ label, value, stamp }: { label: string; value: string; stamp: StampLineProps }) {
  return <div data-stat-card className="min-w-0 space-y-3 border border-white/10 bg-[var(--msp-panel-2)] p-4" style={{ borderRadius: 'var(--msp-radius-card)' }}>
    <p className="break-words text-xl font-semibold tabular-nums">{value}</p>
    <p className="text-xs text-[var(--msp-text-muted)]">{label}</p>
    <StampLine {...stamp} />
  </div>;
}
