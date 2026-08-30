'use client';

import { useEndpoint } from '@/components/intelligence/useEndpoint';
import CommandStrip from '@/components/intelligence/CommandStrip';
import IntelligenceTable, { type IntelColumn } from '@/components/intelligence/IntelligenceTable';
import { StateCell, MetricCell, SectionHeader, LastUpdatedBadge } from '@/components/intelligence/primitives';
import { STATE_STYLES } from '@/lib/intelligence/states';
import type { LeadLagResult } from '@/lib/intelligence/types';

const COLUMNS: IntelColumn[] = [
  { key: 'market', label: 'Market', align: 'left' },
  { key: 'sync', label: 'Sync', tooltip: 'Contemporaneous correlation with NQ (not predictive).' },
  { key: 'lead', label: 'True Lead', tooltip: 'Best predictive lead after excluding synchronous correlation.' },
  { key: 'adv', label: 'Adv', align: 'right', tooltip: 'Lead advantage vs synchronous read.' },
  { key: 'rel', label: 'Reliability' },
  { key: 'edge', label: 'Edge / Status' },
  { key: 'z', label: 'Move Z', align: 'right' },
  { key: 'imp', label: 'Pred Imp', align: 'right' },
];

export default function LeadLagPage() {
  const { data, loading, error, updatedAt } = useEndpoint<LeadLagResult>('/api/intelligence/lead-lag');

  return (
    <div>
      <header style={{ marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--msp-text)' }}>Cross-Asset Lead/Lag</h1>
        <p style={{ margin: '4px 0 0', fontSize: '0.86rem', color: 'var(--msp-text-muted)' }}>
          Whether validated cross-assets are genuinely leading NQ. True Lead excludes synchronous correlation; cash research is NY RTH only. {data ? `(${data.symbol})` : ''}
        </p>
      </header>

      {loading && <Note>Loading Lead/Lag…</Note>}
      {error && <Note tone="error">Could not load: {error}</Note>}

      {data && (
        <>
          <SectionHeader title="True Lead / Lag" right={<LastUpdatedBadge timestamp={updatedAt ?? undefined} />} />
          <CommandStrip
            items={[
              { label: 'Pred Edge', value: data.predEdge, semantic: 'neutral' },
              { label: 'Confirm', value: data.confirm, semantic: data.confirmSemantic },
              { label: 'Session', value: data.session, semantic: 'positive' },
              { label: 'Leader #1', value: data.leaders[0], semantic: 'neutral' },
              { label: 'Leader #2', value: data.leaders[1], semantic: 'neutral' },
              { label: 'Leader #3', value: data.leaders[2], semantic: 'neutral' },
            ]}
          />

          {data.noValidLead && (
            <div
              style={{
                marginTop: 12,
                padding: '10px 14px',
                borderRadius: 'var(--msp-radius-card)',
                background: STATE_STYLES.neutral.bg,
                border: `1px solid ${STATE_STYLES.neutral.border}`,
                color: STATE_STYLES.neutral.fg,
                fontSize: '0.82rem',
                fontWeight: 600,
              }}
            >
              NO VALID LEAD — NEUTRAL. No cross-asset currently has a qualified predictive lead over NQ. This is an expected state, not an error.
            </div>
          )}

          <SectionHeader title="Cross-Asset Table" />
          <IntelligenceTable
            columns={COLUMNS}
            stickyFirst
            minWidth={980}
            rows={data.rows.map((r) => ({
              id: r.market,
              cells: [
                <MetricCell key="m" align="left" strong>{r.market}</MetricCell>,
                <StateCell key="sy" label={r.sync} semantic={r.syncSemantic} />,
                <StateCell key="tl" label={r.trueLead} semantic={r.trueLeadSemantic} />,
                <MetricCell key="ad" align="right" muted>{r.adv}</MetricCell>,
                <StateCell key="rl" label={r.rel} semantic={r.relSemantic} />,
                <StateCell key="ed" label={r.edgeStatus} semantic={r.edgeSemantic} />,
                <MetricCell key="z" align="right">{r.moveZ}</MetricCell>,
                <MetricCell key="im" align="right" muted>{r.predImp}</MetricCell>,
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
