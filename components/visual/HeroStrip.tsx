import React from 'react';
import StampLine, { type StampLineProps } from './StampLine';
export default function HeroStrip({ subject, headline, color, freshness, stamp }: { subject: string; headline: string; color: string; freshness: string; stamp: StampLineProps }) {
  return <div aria-label={subject} className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-2xl font-bold tracking-tight" style={{ color }}>{headline}</p>
      <span className="text-xs text-[var(--msp-text-muted)]">{freshness}</span>
    </div>
    <StampLine {...stamp} />
  </div>;
}
