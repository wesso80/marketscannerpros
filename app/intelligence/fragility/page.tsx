'use client';

import { useEndpoint } from '@/components/intelligence/useEndpoint';
import CommandStrip from '@/components/intelligence/CommandStrip';
import IntelligenceTable, { type IntelColumn } from '@/components/intelligence/IntelligenceTable';
import { StateCell, ScoreCell, MetricCell, SectionHeader, LastUpdatedBadge } from '@/components/intelligence/primitives';
import type { FragilityResult } from '@/lib/intelligence/types';

const INTERNAL_COLUMNS: IntelColumn[] = [
  { key: 'metric', label: 'Metric', align: 'left' },
  { key: 'value', label: 'Value', align: 'right' },
  { key: 'state', label: 'State' },
  { key: 'risk', label: 'Risk' },
  { key: 'detail', label: 'Detail', align: 'left' },
  { key: 'trend', label: 'Trend' },
];

const RADAR_COLUMNS: IntelColumn[] = [
  { key: 'sector', label: 'Rotation', align: 'left' },
  { key: 'score', label: 'Score', align: 'right' },
  { key: 'state', label: 'State' },
  { key: 'rep', label: 'Representative', align: 'left' },
  { key: 'm20', label: '20D', align: 'right' },
  { key: 'rel', label: 'Rel/SPY', align: 'right' },
];

export default function FragilityPage() {
  const { data, loading, error, updatedAt } = useEndpoint<FragilityResult>('/api/intelligence/fragility');

  return (
    <div>
      <header style={{ marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--msp-text)' }}>Market Fragility</h1>
        <p style={{ margin: '4px 0 0', fontSize: '0.86rem', color: 'var(--msp-text-muted)' }}>
          Market health beneath headline price — breadth, credit, volatility, USD/rates, leadership, and capital rotation.
        </p>
      </header>

      {loading && <Note>Loading Market Fragility…</Note>}
      {error && <Note tone="error">Could not load: {error}</Note>}

      {data && (
        <>
          <SectionHeader
            title="Structure"
            right={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <DataSourceBadge meta={data.meta} />
                <LastUpdatedBadge timestamp={updatedAt ?? undefined} />
              </span>
            }
          />
          <DataQualityRow meta={data.meta} />
          <CommandStrip
            items={[
              { label: 'Health', value: data.health, semantic: data.healthSemantic },
              { label: 'Fragility', value: data.fragility, semantic: 'strong-positive' },
              { label: 'Transition', value: data.transition, semantic: 'strong-positive' },
              { label: 'Divergence', value: data.divergence, semantic: 'strong-positive' },
              { label: 'Rotation', value: data.rotation, semantic: 'neutral' },
              { label: 'Verdict', value: data.verdict, semantic: data.verdictSemantic },
            ]}
          />

          <SectionHeader title="Components" />
          <CommandStrip items={data.components.map((c) => ({ label: c.label, value: c.value, semantic: c.semantic }))} />

          <SectionHeader title="Warnings" />
          <CommandStrip items={data.warnings.map((w) => ({ label: w.label, value: w.state, semantic: w.semantic }))} />

          <SectionHeader title="Path & Rotation Leaders" />
          <CommandStrip
            items={[
              { label: 'Path', value: data.path, semantic: 'positive' },
              { label: 'Playbook', value: data.playbook, semantic: 'positive' },
              { label: 'Confidence', value: data.confidence, semantic: 'strong-positive' },
              { label: 'Rot #1', value: data.rot1, semantic: 'strong-positive' },
              { label: 'Rot #2', value: data.rot2, semantic: 'strong-positive' },
              { label: 'Rot #3', value: data.rot3, semantic: 'positive' },
            ]}
          />

          <SectionHeader title="Internals" />
          <IntelligenceTable
            columns={INTERNAL_COLUMNS}
            stickyFirst
            minWidth={820}
            rows={data.internals.map((r) => ({
              id: r.metric,
              cells: [
                <MetricCell key="m" align="left" strong>{r.metric}</MetricCell>,
                <MetricCell key="v" align="right">{r.value}</MetricCell>,
                <StateCell key="s" label={r.state} semantic={r.semantic} />,
                <MetricCell key="r" align="center" muted>{r.risk}</MetricCell>,
                <MetricCell key="d" align="left" muted>{r.detail}</MetricCell>,
                <MetricCell key="t" align="center" muted>{r.trend}</MetricCell>,
              ],
            }))}
          />

          <SectionHeader title="Rotation Radar" />
          <IntelligenceTable
            columns={RADAR_COLUMNS}
            stickyFirst
            minWidth={720}
            rows={data.radar.map((r) => ({
              id: r.sector,
              cells: [
                <MetricCell key="s" align="left" strong>{r.sector}</MetricCell>,
                <ScoreCell key="sc" value={r.score.toFixed(2)} semantic={r.semantic} />,
                <StateCell key="st" label={r.state} semantic={r.semantic} />,
                <MetricCell key="rp" align="left" muted>{r.representative}</MetricCell>,
                <MetricCell key="m" align="right">{r.m20}</MetricCell>,
                <MetricCell key="rl" align="right" muted>{r.relSpy}</MetricCell>,
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

function DataQualityRow({ meta }: { meta?: FragilityResult['meta'] }) {
  const dq = meta?.dataQuality;
  const isMock = (meta?.sourceStatus ?? 'MOCK') === 'MOCK';
  const parity = dq?.parityStatus ?? 'FORMULA_VALIDATED';
  const parityLabel =
    parity === 'FULL_PARITY' ? 'FULL PARITY' : parity === 'DATA_PARITY_PENDING' ? 'DATA PARITY PENDING' : 'FORMULA VALIDATED';
  const parityColor = parity === 'FULL_PARITY' ? 'var(--msp-bull)' : parity === 'DATA_PARITY_PENDING' ? 'var(--msp-warn)' : 'var(--msp-accent)';

  const dataLabel = isMock
    ? 'MOCK · development fixture'
    : meta?.isStale
      ? 'STALE'
      : meta?.sourceStatus === 'PARTIAL'
        ? 'LIVE · PARTIAL'
        : 'LIVE';

  const segments = isMock
    ? [`DATA: ${dataLabel}`]
    : [
        `DATA: ${dataLabel}`,
        `COVERAGE: ${dq?.coveragePercent ?? 0}%`,
        `EXACT: ${dq?.exactSeriesCount ?? 0}`,
        `PROXY: ${dq?.proxySeriesCount ?? 0}`,
        `MISSING: ${dq?.missingSeriesCount ?? 0}`,
      ];

  const detailTitle =
    [
      dq?.proxySymbols?.length ? `Proxy series: ${dq.proxySymbols.join(', ')}` : null,
      dq?.missingSymbols?.length ? `Missing series: ${dq.missingSymbols.join(', ')}` : null,
      meta?.providersUsed?.length ? `Providers: ${meta.providersUsed.join(', ')}` : null,
      meta ? `Data as of ${meta.dataAsOf} · calculated ${meta.calculatedAt}` : null,
    ]
      .filter(Boolean)
      .join(' | ') || 'Development fixture — no live series fetched.';

  return (
    <div
      title={detailTitle}
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 10,
        margin: '2px 0 10px',
        padding: '4px 10px',
        borderRadius: 'var(--msp-radius-card)',
        border: '1px solid var(--msp-border)',
        background: 'var(--msp-panel)',
        fontSize: '0.68rem',
        fontWeight: 600,
        letterSpacing: '0.03em',
        color: 'var(--msp-text-muted)',
        fontFamily: 'var(--font-mono, ui-monospace, monospace)',
      }}
    >
      <span style={{ opacity: 0.9 }}>{segments.join('  |  ')}</span>
      <span
        style={{
          padding: '1px 7px',
          borderRadius: 999,
          border: `1px solid ${parityColor}`,
          color: parityColor,
          fontSize: '0.62rem',
          fontWeight: 700,
          textTransform: 'uppercase',
        }}
      >
        {parityLabel}
      </span>
    </div>
  );
}

function DataSourceBadge({ meta }: { meta?: FragilityResult['meta'] }) {
  // Default to MOCK when meta is absent so we never imply live data.
  const status = meta?.sourceStatus ?? 'MOCK';
  const isStale = meta?.isStale ?? false;
  const label = isStale ? 'STALE' : status === 'OK' ? 'LIVE' : status === 'PARTIAL' ? 'LIVE · PARTIAL' : status;
  const color = isStale
    ? 'var(--msp-warn)'
    : status === 'OK' || status === 'PARTIAL'
      ? 'var(--msp-bull)'
      : 'var(--msp-text-muted)';
  const title = meta
    ? `Source: ${status}${meta.providersUsed.length ? ` · ${meta.providersUsed.join(', ')}` : ''} · data as of ${meta.dataAsOf}`
    : 'Development fixture (mock data)';
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 8px',
        borderRadius: 999,
        border: `1px solid ${color}`,
        color,
        fontSize: '0.7rem',
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: color }} />
      {label}
    </span>
  );
}
