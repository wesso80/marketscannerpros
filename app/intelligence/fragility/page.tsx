'use client';

import { useEndpoint } from '@/components/intelligence/useEndpoint';
import CollapsibleSection from '@/components/visual/CollapsibleSection';
import SourceLine from '@/components/visual/SourceLine';
import { EvidenceBars, EvidenceMetrics as CommandStrip, EvidenceVerdict, EvidenceWarning, evidenceLabel } from '@/components/intelligence/CompactEvidence';

import IntelligenceTable, { type IntelColumn } from '@/components/intelligence/IntelligenceTable';
import { StateCell, ScoreCell, MetricCell, SectionHeader } from '@/components/intelligence/primitives';
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
  { key: 'score', label: 'Reading', align: 'right' },
  { key: 'state', label: 'State' },
  { key: 'rep', label: 'Representative', align: 'left' },
  { key: 'm20', label: '20D', align: 'right' },
  { key: 'rel', label: 'Rel/SPY', align: 'right' },
];

export default function FragilityPage() {
  const { data, loading, error, retry } = useEndpoint<FragilityResult>('/api/intelligence/fragility');

  return (
    <div>
      <header style={{ marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--msp-text)' }}>Market Fragility</h1>
        <p style={{ margin: '4px 0 0', fontSize: '0.86rem', color: 'var(--msp-text-muted)' }}>
          Market health beneath headline price — breadth, credit, volatility, USD/rates, leadership, and capital rotation.
        </p>
      </header>

      {loading && <Note>Loading Market Fragility…</Note>}
      {error && (
        <Note tone="error">
          Could not load: {error}{' '}
          <button type="button" onClick={retry} disabled={loading} style={{ marginLeft: 8, padding: '2px 10px', borderRadius: 6, border: '1px solid var(--msp-border)', background: 'transparent', color: 'var(--msp-text)', cursor: 'pointer', fontWeight: 700 }}>
            Retry
          </button>
        </Note>
      )}

      {data && (
        <>
          <EvidenceVerdict>{evidenceLabel(data.verdict)}</EvidenceVerdict>
          <CommandStrip items={[
            { label: 'Health', value: data.health },
            { label: 'Fragility', value: data.fragility },
            { label: 'Transition', value: data.transition },
            { label: 'Divergence', value: data.divergence },
          ]} />
          <EvidenceBars title="Market health components · reading" rows={data.components} maximum={100} />
          <DataQualityRow meta={data.meta} />
          <CollapsibleSection title="Market evidence" summary={`${data.internals.length} internal measures · ${data.radar.length} sectors`}>
          <SectionHeader title="Warnings" />
          <CommandStrip items={data.warnings.map((w) => ({ label: w.label, value: w.state, semantic: w.semantic }))} />

          <SectionHeader title="Path & Rotation Leaders" />
          <CommandStrip
            items={[
              { label: 'Path', value: data.path, semantic: 'positive' },
              { label: 'Research context', value: data.playbook, semantic: 'positive' },
              { label: 'Evidence quality', value: data.confidence, semantic: parseFloat(data.confidence) >= 70 ? 'strong-positive' : 'neutral' },
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
                <MetricCell key="m" align="left" strong>{evidenceLabel(r.metric)}</MetricCell>,
                <MetricCell key="v" align="right">{evidenceLabel(r.value)}</MetricCell>,
                <StateCell key="s" label={evidenceLabel(r.state)} semantic={r.semantic} />,
                <MetricCell key="r" align="center" muted>{evidenceLabel(r.risk)}</MetricCell>,
                <MetricCell key="d" align="left" muted>{evidenceLabel(r.detail)}</MetricCell>,
                <MetricCell key="t" align="center" muted>{evidenceLabel(r.trend)}</MetricCell>,
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
                <MetricCell key="s" align="left" strong>{evidenceLabel(r.sector)}</MetricCell>,
                <ScoreCell key="sc" value={r.score.toFixed(2)} semantic={r.semantic} />,
                <StateCell key="st" label={evidenceLabel(r.state)} semantic={r.semantic} />,
                <MetricCell key="rp" align="left" muted>{evidenceLabel(r.representative)}</MetricCell>,
                <MetricCell key="m" align="right">{evidenceLabel(r.m20)}</MetricCell>,
                <MetricCell key="rl" align="right" muted>{evidenceLabel(r.relSpy)}</MetricCell>,
              ],
            }))}
          />
          </CollapsibleSection>
          <SourceLine source={evidenceLabel(data.meta?.providersUsed?.join(', ') || 'Source not collected')} asOf={data.meta?.dataAsOf || data.timestamp} basis="Underlying daily observations · composite component scores" />
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
  const notes = [
    meta?.sourceStatus === 'MOCK' || !meta ? 'Development sample · not live observations' : null,
    meta?.sourceStatus === 'DATA_UNAVAILABLE' ? 'Feed could not be collected' : null,
    meta?.sourceStatus === 'PARTIAL' ? 'Partial coverage' : null,
    meta?.isStale ? 'Older saved observations' : null,
    dq ? `${dq.missingSeriesCount} series not collected · ${dq.coveragePercent.toFixed(1)}% coverage` : 'Coverage not collected',
    evidenceLabel(dq?.parityStatus || 'Source checks not recorded'),
  ].filter(Boolean);
  return <EvidenceWarning>{notes.join(' · ')}</EvidenceWarning>;
}
