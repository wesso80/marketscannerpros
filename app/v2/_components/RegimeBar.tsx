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
import { humanizeEnum } from '@/lib/presentation/labels';

export default function RegimeBar({ hideIfMissing = false }: { hideIfMissing?: boolean } = {}) {
  const { data: regime, loading } = useRegime();

  // No regime means "unavailable" — never a default such as neutral.
  const regimeLabel = regime?.regime ?? null;
  const signals = regime?.signals || [];
  const nonStaleSignals = signals.filter(s => !s.stale && s.counted !== false);

  if (hideIfMissing && (!regimeLabel || /unknown|unavailable/i.test(regimeLabel))) return null;

  const summary = (
    <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">Market Regime</span>
      {loading ? <span className="text-xs text-slate-500">Loading</span> : regimeLabel
        ? <Badge label={humanizeEnum(regimeLabel)} color={REGIME_COLORS[regimeLabel as RegimePriority] || 'var(--msp-text-muted)'} small />
        : <Badge label="Not available right now" color="var(--msp-text-muted)" small />}
    </span>
  );

  return (
    <div className="min-w-0 px-4 py-1 bg-[var(--msp-panel-2)] border-b border-[var(--msp-border)]">
      {!loading && nonStaleSignals.length > 0 ? (
        <details data-regime-evidence className="min-w-0">
          <summary className="min-h-10 cursor-pointer content-center text-xs text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60">
            <span className="inline-flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 align-middle">
              {summary}
              <span>{nonStaleSignals.length} supporting {nonStaleSignals.length === 1 ? 'reading' : 'readings'}</span>
            </span>
          </summary>
          <ul aria-label="Market regime supporting readings" className="grid min-w-0 gap-2 pb-2 pt-1 sm:grid-cols-2 lg:grid-cols-3">
            {nonStaleSignals.map((signal) => (
              <li key={signal.source} className="min-w-0 break-words text-xs text-slate-400">
                <span>{signal.kind === 'market' ? 'Market data' : humanizeEnum(signal.source)}</span>
                <span className="ml-2" style={{ color: REGIME_COLORS[signal.regime as RegimePriority] || 'var(--msp-text-muted)' }}>{humanizeEnum(signal.regime)}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : <div className="min-h-10 content-center">{summary}</div>}
    </div>
  );
}
