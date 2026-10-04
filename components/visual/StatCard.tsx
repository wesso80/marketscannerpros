import React from 'react';
import StampLine, { type StampLineProps } from './StampLine';
export default function StatCard({ label, value, stamp, large = false, color, detail }: { label: string; value: string; stamp?: StampLineProps; large?: boolean; color?: string; detail?: string }) {
  return <div data-stat-card className="min-w-0 space-y-3 border border-white/10 bg-[var(--msp-panel-2)] p-4" style={{ borderRadius: 'var(--msp-radius-card)' }}>
    <p className={`break-words font-semibold tabular-nums ${large ? 'text-3xl md:text-4xl' : 'text-base md:text-lg'}`} style={{color}}>{value}</p>
    <p className="text-xs text-[var(--msp-text-muted)]">{label}</p>
    {detail && <p className="text-sm" style={{color}}>{detail}</p>}
    {stamp && <StampLine {...stamp} />}
  </div>;
}
