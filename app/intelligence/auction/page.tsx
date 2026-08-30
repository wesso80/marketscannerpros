'use client';

import { useEndpoint } from '@/components/intelligence/useEndpoint';
import CommandStrip from '@/components/intelligence/CommandStrip';
import IntelligenceTable, { type IntelColumn } from '@/components/intelligence/IntelligenceTable';
import { StateCell, MetricCell, SectionHeader, LastUpdatedBadge } from '@/components/intelligence/primitives';
import type { AuctionResult } from '@/lib/intelligence/types';

const LEVEL_COLUMNS: IntelColumn[] = [
  { key: 'level', label: 'Level', align: 'left' },
  { key: 'price', label: 'Price', align: 'right' },
  { key: 'state', label: 'State' },
  { key: 'dist', label: 'Distance', align: 'right', tooltip: 'Points from current price to the level.' },
];

export default function AuctionPage() {
  const { data, loading, error, updatedAt } = useEndpoint<AuctionResult>('/api/intelligence/auction');

  return (
    <div>
      <header style={{ marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--msp-text)' }}>NQ Auction Engine</h1>
        <p style={{ margin: '4px 0 0', fontSize: '0.86rem', color: 'var(--msp-text-muted)' }}>
          Auction structure, sweep/reclaim state, active levels, and trade-plan context. {data ? `(${data.symbol})` : ''}
        </p>
      </header>

      {loading && <Note>Loading NQ Auction…</Note>}
      {error && <Note tone="error">Could not load: {error}</Note>}

      {data && (
        <>
          <SectionHeader title="Auction" right={<LastUpdatedBadge timestamp={updatedAt ?? undefined} />} />
          <CommandStrip
            items={[
              { label: 'Session', value: data.session, semantic: 'neutral' },
              { label: 'Transition', value: data.transition, semantic: 'neutral' },
              { label: 'Auction', value: data.auction, semantic: 'neutral' },
              { label: 'Setup', value: data.setup, semantic: data.setupSemantic },
              { label: 'Quality', value: data.setupScore, semantic: 'warning' },
              { label: 'Active Level', value: data.activeLevel, semantic: 'neutral' },
              { label: 'Stage', value: data.stage, semantic: 'warning' },
              { label: 'RVOL', value: data.rvol, semantic: 'warning' },
            ]}
          />

          <SectionHeader title="Trade Plan" subtitle="Educational plan context only — no orders are placed or routed." />
          <CommandStrip
            items={[
              { label: 'Exec State', value: data.execState, semantic: data.execSemantic },
              { label: 'Entry', value: data.entry, semantic: 'neutral' },
              { label: 'Stop', value: data.stop, semantic: 'negative' },
              { label: 'Risk', value: data.risk, semantic: 'neutral' },
              { label: 'TP1', value: `${data.tp1} · ${data.rr1}`, semantic: 'positive' },
              { label: 'TP2', value: `${data.tp2} · ${data.rr2}`, semantic: 'positive' },
              { label: 'TP3', value: `${data.tp3} · ${data.rr3}`, semantic: 'positive' },
              { label: 'Trade', value: data.tradeState, semantic: 'warning' },
            ]}
          />

          <SectionHeader title="Structure" />
          <CommandStrip
            items={[
              { label: 'EMA 9/21', value: data.emaState, semantic: 'positive' },
              { label: 'Flow', value: data.flow, semantic: 'negative' },
              { label: 'ATR', value: data.atr, semantic: 'neutral' },
              { label: 'Oscillator', value: data.osc, semantic: 'negative' },
              { label: 'HTF', value: data.htf, semantic: 'negative' },
              { label: 'Live R', value: data.liveR, semantic: 'positive' },
              { label: 'MFE', value: data.mfe, semantic: 'positive' },
              { label: 'MAE', value: data.mae, semantic: 'warning' },
            ]}
          />

          <SectionHeader title="Auction Levels" subtitle="Prior-day, overnight, opening-range, prior-week levels and session VWAP." />
          <IntelligenceTable
            columns={LEVEL_COLUMNS}
            stickyFirst
            minWidth={520}
            rows={data.levels.map((l) => ({
              id: l.name,
              cells: [
                <MetricCell key="n" align="left" strong>{l.name}</MetricCell>,
                <MetricCell key="p" align="right">{l.price}</MetricCell>,
                <StateCell key="s" label={l.state} semantic={l.semantic} />,
                <MetricCell key="d" align="right" muted>{l.dist}</MetricCell>,
              ],
            }))}
          />
        </>
      )}
    </div>
  );
}

function Note({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'error' }) {
  return (
    <div style={{ marginTop: 16, padding: '18px 16px', borderRadius: 'var(--msp-radius-card)', border: '1px solid var(--msp-border)', background: 'var(--msp-panel)', fontSize: '0.85rem', color: tone === 'error' ? 'var(--msp-bear)' : 'var(--msp-text-muted)' }}>
      {children}
    </div>
  );
}
