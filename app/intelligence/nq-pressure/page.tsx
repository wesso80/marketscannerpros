'use client';

import { useEndpoint } from '@/components/intelligence/useEndpoint';
import CommandStrip from '@/components/intelligence/CommandStrip';
import IntelligenceTable, { type IntelColumn } from '@/components/intelligence/IntelligenceTable';
import { StateCell, ScoreCell, MetricCell, SectionHeader, LastUpdatedBadge } from '@/components/intelligence/primitives';
import type { PressureResult } from '@/lib/intelligence/types';

const STACK_COLUMNS: IntelColumn[] = [
  { key: 'tf', label: 'Timeframe', align: 'left' },
  { key: 'val', label: 'Pressure', align: 'right', tooltip: 'Signed pressure reading for the timeframe (-100..100).' },
];

const CROSS_COLUMNS: IntelColumn[] = [
  { key: 'm', label: 'Market', align: 'left' },
  { key: 's', label: 'Confirmation' },
];

export default function NqPressurePage() {
  const { data, loading, error, updatedAt } = useEndpoint<PressureResult>('/api/intelligence/nq-pressure');

  return (
    <div>
      <header style={{ marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--msp-text)' }}>NQ Institutional Pressure</h1>
        <p style={{ margin: '4px 0 0', fontSize: '0.86rem', color: 'var(--msp-text-muted)' }}>
          Multi-timeframe pressure stack and session-aware cross-market confirmation. A structure/cross-market proxy — not DOM or order-flow. {data ? `(${data.symbol})` : ''}
        </p>
      </header>

      {loading && <Note>Loading NQ Pressure…</Note>}
      {error && <Note tone="error">Could not load: {error}</Note>}

      {data && (
        <>
          <SectionHeader title="Pressure" right={<LastUpdatedBadge timestamp={updatedAt ?? undefined} />} />
          <CommandStrip
            items={[
              { label: 'Pressure', value: data.pressure, semantic: data.pressureSemantic },
              { label: 'Regime', value: data.regime, semantic: data.regimeSemantic },
              { label: 'Confidence', value: data.confidence, semantic: data.confidenceSemantic },
              { label: 'Session', value: data.session, semantic: 'neutral' },
              { label: 'Setup', value: data.setup, semantic: 'warning' },
              { label: 'Playbook', value: data.playbook, semantic: 'warning' },
            ]}
          />

          <SectionHeader title="Context" />
          <CommandStrip
            items={[
              { label: 'Momentum', value: data.momentum, semantic: data.momentumSemantic },
              { label: 'Session P', value: data.sessionP, semantic: 'warning' },
              { label: 'Cross P', value: data.crossP, semantic: 'neutral' },
              { label: 'VWAP', value: data.vwap, semantic: 'negative' },
              { label: 'S-RVOL', value: data.rvol, semantic: 'neutral' },
              { label: 'Day Type', value: data.dayType, semantic: 'warning' },
            ]}
          />

          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', alignItems: 'start' }}>
            <div>
              <SectionHeader title="MTF Pressure Stack" subtitle={data.stack} />
              <IntelligenceTable
                columns={STACK_COLUMNS}
                minWidth={280}
                rows={data.stackRungs.map((r) => ({
                  id: r.label,
                  cells: [
                    <MetricCell key="l" align="left" strong>{r.label}</MetricCell>,
                    <ScoreCell key="v" value={r.value} semantic={r.semantic} />,
                  ],
                }))}
              />
            </div>
            <div>
              <SectionHeader title="Cross-Market Confirmation" subtitle={`Cross agreement: ${data.crossAgree}`} />
              <IntelligenceTable
                columns={CROSS_COLUMNS}
                minWidth={280}
                rows={data.crossMarkets.map((c) => ({
                  id: c.label,
                  cells: [
                    <MetricCell key="m" align="left" strong>{c.label}</MetricCell>,
                    <StateCell key="s" label={c.state} semantic={c.semantic} />,
                  ],
                }))}
              />
            </div>
          </div>

          <SectionHeader title="Key Levels" />
          <CommandStrip
            items={[
              { label: 'Magnet ↑', value: data.magnetUp, semantic: 'positive' },
              { label: 'Magnet ↓', value: data.magnetDn, semantic: 'negative' },
              { label: 'PDH / PDL', value: data.pdhpdl, semantic: 'neutral' },
              { label: 'ORH / ORL', value: data.orhorl, semantic: 'neutral' },
              { label: 'ONH / ONL', value: data.onhonl, semantic: 'neutral' },
              { label: 'PWH / PWL', value: data.pwhpwl, semantic: 'neutral' },
            ]}
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
