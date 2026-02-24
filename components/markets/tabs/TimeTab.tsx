'use client';

import dynamic from 'next/dynamic';
import type { TickerContext } from '../types';

const TimeConfluenceWidget = dynamic(
  () => import('@/components/TimeConfluenceWidget'),
  { ssr: false, loading: () => <div className="h-[200px] animate-pulse rounded-md bg-[var(--msp-panel-2)]" /> }
);

/**
 * Time Tab — Session behavior, time confluence state, vol windows.
 * Absorbs the Time Confluence page entirely.
 */
export default function TimeTab({ ctx }: { ctx: TickerContext }) {
  const { symbol, loading } = ctx;

  if (loading) {
    return <div className="h-[300px] animate-pulse rounded-md bg-[var(--msp-panel-2)]" />;
  }

  return (
    <div className="grid gap-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">Time Analysis</p>
        <h3 className="text-xs font-bold text-[var(--msp-text)]">{symbol} — Session Behavior, Confluence & Vol Windows</h3>
      </div>

      {/* Time Confluence Widget — full embed from existing component */}
      <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2">
        <TimeConfluenceWidget
          showMacro
          showMicro
          showTWAP
          showCalendar
          symbol={symbol}
        />
      </div>

      {/* Session context */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <SessionCard
          title="Pre-Market"
          time="04:00 – 09:30 ET"
          desc="Earnings reaction, gap analysis. Low liquidity — wider spreads."
        />
        <SessionCard
          title="Regular Session"
          time="09:30 – 16:00 ET"
          desc="Full liquidity. Key windows: Open drive (9:30–10:00), Power hour (15:00–16:00)."
        />
        <SessionCard
          title="After Hours"
          time="16:00 – 20:00 ET"
          desc="Earnings reports, news reactions. Thin book — volatile moves."
        />
      </div>

      {/* Explanation */}
      <div className="rounded-md border border-dashed border-[var(--msp-border)] bg-[var(--msp-panel)] p-3 text-[11px] text-[var(--msp-text-faint)]">
        <p className="font-semibold text-[var(--msp-text-muted)] mb-1">How Time Confluence Works</p>
        <p>
          Multiple timeframe candle closes + Fibonacci time ratios + TWAP execution windows are scored together.
          When several time factors align, the confluence score rises — historically correlated with higher directional hit rates.
          Higher scores = higher probability windows for entry execution.
        </p>
      </div>
    </div>
  );
}

function SessionCard({ title, time, desc }: { title: string; time: string; desc: string }) {
  return (
    <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--msp-accent)]">{title}</p>
      <p className="text-[10px] font-mono text-[var(--msp-text-muted)]">{time}</p>
      <p className="mt-1 text-[11px] text-[var(--msp-text-faint)]">{desc}</p>
    </div>
  );
}
