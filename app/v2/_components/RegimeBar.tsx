'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   MSP v2 — Regime Bar
   Shows current market regime from the real /api/regime endpoint.
   Sticky below nav.
   ═══════════════════════════════════════════════════════════════════════════ */

import { Badge } from './ui';
import { REGIME_COLORS } from '../_lib/constants';
import { useRegime } from '../_lib/api';
import type { RegimePriority } from '../_lib/types';

export default function RegimeBar() {
  const { data: regime, loading } = useRegime();

  const regimeLabel = regime?.regime || 'neutral';
  const signals = regime?.signals || [];
  const nonStaleSignals = signals.filter(s => !s.stale);

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-[var(--msp-panel-2)] border-b border-[var(--msp-border)] overflow-x-auto">
      <span className="text-[10px] uppercase tracking-wider text-slate-500 whitespace-nowrap">Market Regime</span>
      {loading ? (
        <span className="text-[10px] text-slate-600 animate-pulse">Loading...</span>
      ) : (
        <>
          <Badge label={regimeLabel} color={REGIME_COLORS[regimeLabel as RegimePriority] || '#64748B'} small />
          {nonStaleSignals.length > 0 && (
            <>
              <div className="h-3 w-px bg-slate-700" />
              {nonStaleSignals.map(s => (
                <span key={s.source} className="text-[10px] text-slate-500 whitespace-nowrap">
                  <span style={{ color: REGIME_COLORS[s.regime as RegimePriority] || '#64748B' }}>{s.source}</span>
                  <span className="text-slate-600 ml-1">{s.regime}</span>
                </span>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
