'use client';

import { useState, useEffect } from 'react';
import type { TickerContext } from '../types';
import type { CatalystEvent, CatalystSubtype, EventStudyResult } from '@/lib/catalyst/types';
import { useUserTier } from '@/lib/useUserTier';
import CatalystImpactCard from '@/components/catalyst/CatalystImpactCard';
import CatalystDetailsDrawer from '@/components/catalyst/CatalystDetailsDrawer';
import { useCatalystRisk, catalystRiskSummary } from '@/lib/catalyst/useCatalystRisk';

/* ────────────────────────────────────────────────────────────────
   CatalystTab — 7th tab in TickerTabs. Shows recent catalyst events
   for the selected ticker, their classified subtypes, and impact
   study cards for each unique subtype discovered.
   Pro Trader only — gated at the tab level.
   ──────────────────────────────────────────────────────────────── */

const SUBTYPE_LABELS: Record<string, string> = {
  MNA_RUMOR: 'M&A Rumor',
  MNA_LOI: 'M&A Letter of Intent',
  MNA_DEFINITIVE: 'M&A Definitive',
  LEADERSHIP_CHANGE: 'Leadership Change',
  SECONDARY_OFFERING: 'Secondary Offering',
  BUYBACK_AUTH: 'Buyback Authorization',
  DIVIDEND_CHANGE: 'Dividend Change',
  SEC_8K_MATERIAL_AGREEMENT: '8-K Material Agreement',
  SEC_8K_LEADERSHIP: '8-K Leadership',
  SEC_13D_STAKE: '13D Large Stake',
  SEC_10K_10Q: '10-K / 10-Q Filing',
};

const RISK_COLORS: Record<string, string> = {
  NONE: 'text-slate-500',
  LOW: 'text-emerald-400',
  ELEVATED: 'text-amber-400',
  HIGH: 'text-rose-400',
};

const RISK_BADGES: Record<string, { border: string; bg: string; text: string }> = {
  NONE: { border: 'border-slate-500/30', bg: 'bg-slate-500/10', text: 'text-slate-400' },
  LOW: { border: 'border-emerald-500/30', bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  ELEVATED: { border: 'border-amber-500/30', bg: 'bg-amber-500/10', text: 'text-amber-400' },
  HIGH: { border: 'border-rose-500/30', bg: 'bg-rose-500/10', text: 'text-rose-400' },
};

export default function CatalystTab({ ctx }: { ctx: TickerContext }) {
  const { symbol, loading: ctxLoading } = ctx;
  const { tier } = useUserTier();
  const [events, setEvents] = useState<CatalystEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [drawerStudy, setDrawerStudy] = useState<EventStudyResult | null>(null);
  const { riskLevel, activeCatalyst } = useCatalystRisk(symbol, 30);

  // Fetch recent events
  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setEventsLoading(true);

    fetch(`/api/catalyst/events?ticker=${encodeURIComponent(symbol)}&days=90`)
      .then(r => r.ok ? r.json() : { events: [] })
      .then(data => { if (!cancelled) setEvents(data.events || []); })
      .catch(() => { if (!cancelled) setEvents([]); })
      .finally(() => { if (!cancelled) setEventsLoading(false); });

    return () => { cancelled = true; };
  }, [symbol]);

  // Pro Trader gate
  if (tier !== 'pro_trader') {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-8 text-center">
        <p className="text-[11px] font-bold text-[var(--msp-text)]">Catalyst Event Studies</p>
        <p className="mt-1 text-[10px] text-[var(--msp-text-faint)]">
          Institutional-grade event study analysis is available on the <span className="font-bold text-emerald-400">Pro Trader</span> plan.
        </p>
        <a
          href="/pricing"
          className="mt-3 rounded-md bg-emerald-500 px-4 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-600 transition-colors"
        >
          Upgrade to Pro Trader →
        </a>
      </div>
    );
  }

  if (ctxLoading || eventsLoading) {
    return (
      <div className="space-y-2">
        <div className="h-4 w-48 animate-pulse rounded bg-white/5" />
        <div className="h-32 animate-pulse rounded-md bg-[var(--msp-panel-2)]" />
        <div className="h-32 animate-pulse rounded-md bg-[var(--msp-panel-2)]" />
      </div>
    );
  }

  // Unique subtypes found in recent events
  const subtypes = [...new Set(events.map(e => e.catalystSubtype))] as CatalystSubtype[];

  const rb = RISK_BADGES[riskLevel] || RISK_BADGES.NONE;

  return (
    <div className="space-y-3">
      {/* Header + Risk Level */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">Catalyst Intelligence</p>
          <h3 className="text-xs font-bold text-[var(--msp-text)]">{symbol} — Event Study Analysis</h3>
        </div>
        <div className={`rounded-full border px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${rb.border} ${rb.bg} ${rb.text}`}>
          {riskLevel === 'NONE' ? 'No Active Catalyst' : `${riskLevel} RISK`}
        </div>
      </div>

      {/* Active catalyst alert (if any) */}
      {activeCatalyst && riskLevel !== 'NONE' && (
        <div className={`rounded-md border p-2 ${
          riskLevel === 'HIGH' ? 'border-rose-500/30 bg-rose-500/5' :
          riskLevel === 'ELEVATED' ? 'border-amber-500/30 bg-amber-500/5' :
          'border-emerald-500/30 bg-emerald-500/5'
        }`}>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px]">{riskLevel === 'HIGH' ? '🔴' : riskLevel === 'ELEVATED' ? '🟡' : '🟢'}</span>
            <p className={`text-[10px] font-semibold ${RISK_COLORS[riskLevel]}`}>
              Active: {SUBTYPE_LABELS[activeCatalyst.catalystSubtype] || activeCatalyst.catalystSubtype}
            </p>
          </div>
          <p className="mt-0.5 text-[9px] text-[var(--msp-text-faint)] truncate">
            {activeCatalyst.headline || 'No headline'}
            {' · '}
            {new Date(activeCatalyst.eventTimestampUtc).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {' '}
            {activeCatalyst.session}
          </p>
        </div>
      )}

      {/* Recent events timeline */}
      {events.length > 0 && (
        <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--msp-text-faint)]">
            Recent Catalyst Events ({events.length})
          </p>
          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {events.slice(0, 20).map((event, i) => {
              const sevColor = event.severity === 'HIGH' ? 'text-rose-400 bg-rose-500/10 border-rose-500/30'
                : event.severity === 'MED' ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                : 'text-slate-400 bg-slate-500/10 border-slate-500/30';
              return (
                <div key={event.id || i} className="flex items-start gap-2 rounded border border-[var(--msp-border)] bg-[var(--msp-panel)] p-1.5">
                  <span className={`mt-0.5 shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase ${sevColor}`}>
                    {event.severity || 'N/A'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-medium text-[var(--msp-text)] truncate">{event.headline || event.catalystSubtype.replace(/_/g, ' ')}</p>
                    <p className="text-[9px] text-[var(--msp-text-faint)]">
                      {SUBTYPE_LABELS[event.catalystSubtype] || event.catalystSubtype}
                      {' · '}
                      {new Date(event.eventTimestampUtc).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {' · '}
                      {event.session}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Impact study cards — one per unique subtype */}
      {subtypes.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">
            Historical Impact Studies
          </p>
          {subtypes.map(subtype => (
            <CatalystImpactCard
              key={subtype}
              ticker={symbol}
              subtype={subtype}
              onViewDetails={(study) => setDrawerStudy(study)}
            />
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-6">
          <p className="text-center text-[11px] text-[var(--msp-text-faint)]">
            No catalyst events detected for <span className="font-bold text-[var(--msp-text)]">{symbol}</span> in the last 90 days.
            <br />
            <span className="text-[10px]">Events are ingested from SEC EDGAR filings and news sources.</span>
          </p>
        </div>
      )}

      {/* Details drawer */}
      {drawerStudy && (
        <CatalystDetailsDrawer
          study={drawerStudy}
          open={!!drawerStudy}
          onClose={() => setDrawerStudy(null)}
        />
      )}
    </div>
  );
}
