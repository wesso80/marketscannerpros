'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   MSP v2 — Regime Bar
   Shows dominant market regime across all scanned symbols. Sticky below nav.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useMemo } from 'react';
import { Badge } from './ui';
import { REGIME_COLORS } from '../_lib/constants';
import { useV2 } from '../_lib/V2Context';
import type { RegimePriority } from '../_lib/types';

export default function RegimeBar() {
  const { data } = useV2();

  const regimeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    data.forEach(d => { counts[d.regimePriority] = (counts[d.regimePriority] || 0) + 1; });
    return counts;
  }, [data]);

  const dominant = Object.entries(regimeCounts).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-[var(--msp-panel-2)] border-b border-[var(--msp-border)] overflow-x-auto">
      <span className="text-[10px] uppercase tracking-wider text-slate-500 whitespace-nowrap">Market Regime</span>
      <Badge label={dominant?.[0] || 'neutral'} color={REGIME_COLORS[dominant?.[0] as RegimePriority] || '#64748B'} small />
      <div className="h-3 w-px bg-slate-700" />
      {Object.entries(regimeCounts).map(([r, c]) => (
        <span key={r} className="text-[10px] text-slate-500 whitespace-nowrap">
          <span style={{ color: REGIME_COLORS[r as RegimePriority] }}>{r}</span>
          <span className="text-slate-600 ml-1">{c}</span>
        </span>
      ))}
    </div>
  );
}
