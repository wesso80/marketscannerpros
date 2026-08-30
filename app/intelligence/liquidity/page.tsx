'use client';

import { useEndpoint } from '@/components/intelligence/useEndpoint';
import CommandStrip from '@/components/intelligence/CommandStrip';
import IntelligenceTable, { type IntelColumn, type IntelRow } from '@/components/intelligence/IntelligenceTable';
import {
  StateCell,
  ScoreCell,
  MetricCell,
  SectionHeader,
  LastUpdatedBadge,
} from '@/components/intelligence/primitives';
import type { LiquidityResult, TransmissionStage } from '@/lib/intelligence/types';

const STAGE_COLUMNS: IntelColumn[] = [
  { key: 'stage', label: 'Stage', align: 'left' },
  { key: 'driver', label: 'Driver', align: 'left' },
  { key: 'grade', label: 'Grade', tooltip: 'Validation grade from the M2 walk-forward research (A = strongest).' },
  { key: 'conf', label: 'Conf Mth', align: 'right', tooltip: 'Last completed month return for the driver.' },
  { key: 'l20', label: 'Live 20D', align: 'right' },
  { key: 'l5', label: 'Live 5D', align: 'right' },
  { key: 'score', label: 'Score', align: 'right' },
  { key: 'state', label: 'State' },
  { key: 'role', label: 'Role', align: 'left' },
  { key: 'next', label: 'Next', align: 'left' },
];

function stageRow(s: TransmissionStage): IntelRow {
  return {
    id: `stage-${s.stage}`,
    cells: [
      <MetricCell key="st" align="left" strong>{s.stage}. {s.name}</MetricCell>,
      <MetricCell key="dr" align="left" muted>{s.driver}</MetricCell>,
      <StateCell key="gr" label={s.grade} semantic={s.gradeSemantic} />,
      <MetricCell key="cm" align="right" muted>{s.confMonth}</MetricCell>,
      <MetricCell key="l20" align="right">{s.live20d}</MetricCell>,
      <MetricCell key="l5" align="right">{s.live5d}</MetricCell>,
      <ScoreCell key="sc" value={`${s.score}`} semantic={s.semantic} suffix="/100" />,
      <StateCell key="sta" label={s.state} semantic={s.semantic} />,
      <MetricCell key="ro" align="left" muted>{s.role}</MetricCell>,
      <MetricCell key="nx" align="left" muted>{s.next}</MetricCell>,
    ],
    detail: (
      <div style={{ display: 'grid', gap: 4 }}>
        <span><strong style={{ color: 'var(--msp-text)' }}>Role:</strong> {s.role}</span>
        <span><strong style={{ color: 'var(--msp-text)' }}>Next:</strong> {s.next}</span>
        <span style={{ color: 'var(--msp-text-faint)' }}>
          Conf month {s.confMonth} · Live 20D {s.live20d} · Live 5D {s.live5d} · Score {s.score}/100 ({s.state})
        </span>
      </div>
    ),
  };
}

const DRIVER_COLUMNS: IntelColumn[] = [
  { key: 'driver', label: 'Validated Driver', align: 'left' },
  { key: 'detail', label: 'Conf | 20D | 5D  ·  Score', align: 'left' },
  { key: 'score', label: 'Score', align: 'right' },
];

export default function LiquidityPage() {
  const { data, loading, error, updatedAt } = useEndpoint<LiquidityResult>('/api/intelligence/liquidity');

  return (
    <div>
      <header style={{ marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--msp-text)' }}>Liquidity Transmission</h1>
        <p style={{ margin: '4px 0 0', fontSize: '0.86rem', color: 'var(--msp-text-muted)' }}>
          Validated cross-asset liquidity map and the 8-stage rotation clock.
        </p>
      </header>

      {loading && <Note>Loading Liquidity Transmission…</Note>}
      {error && <Note tone="error">Could not load: {error}</Note>}

      {data && (
        <>
          <SectionHeader title="Validated Liquidity Transmission" right={<LastUpdatedBadge timestamp={updatedAt ?? undefined} />} />
          <CommandStrip
            items={[
              { label: 'Flow', value: data.flowState, semantic: data.flowSemantic },
              { label: 'Clock', value: data.clock, semantic: 'strong-positive', tooltip: 'Furthest confirmed stage in the liquidity transmission chain.' },
              { label: 'Cycle', value: data.cycle, semantic: 'positive' },
              { label: 'Validated', value: `${data.validated}/100`, semantic: 'positive', tooltip: 'Cross-asset confirmation from relationships that survived historical validation.' },
              { label: 'Downstream', value: `${data.downstream}/100`, semantic: 'strong-positive' },
              { label: 'Early Warning', value: `${data.earlyWarning}/100 ${data.earlyWarningState}`, semantic: data.earlyWarningSemantic, tooltip: 'Divergence risk between downstream risk appetite and validated liquidity.' },
            ]}
          />

          <SectionHeader title="Global M2" />
          <CommandStrip
            items={[
              { label: 'Global M2', value: data.globalM2, semantic: 'positive' },
              { label: '1M', value: data.m2_1m, semantic: 'positive' },
              { label: '3M Ann', value: data.m2_3mAnn, semantic: 'positive' },
              { label: 'YoY', value: data.m2_yoy, semantic: 'positive' },
              { label: 'Accel', value: data.m2Accel, semantic: 'warning', tooltip: '3-month annualised acceleration (change in pace).' },
              { label: 'M2 Coverage', value: data.m2Coverage, semantic: 'positive', tooltip: 'Global M2 blocs currently reporting.' },
              { label: 'Crypto Window', value: data.cryptoWindow, semantic: 'positive', tooltip: 'Research-derived delayed crypto transmission window.' },
            ]}
          />

          <SectionHeader title="Transmission Clock" subtitle="Select a stage to expand its role and validation detail." />
          <IntelligenceTable columns={STAGE_COLUMNS} rows={data.stages.map(stageRow)} stickyFirst minWidth={1040} />

          <SectionHeader title="Validated Driver Monitor" />
          <IntelligenceTable
            columns={DRIVER_COLUMNS}
            rows={data.drivers.map((d) => ({
              id: d.label,
              cells: [
                <MetricCell key="l" align="left" strong>{d.label}</MetricCell>,
                <MetricCell key="d" align="left" muted>{d.detail}</MetricCell>,
                <ScoreCell key="s" value={`${d.score}`} semantic={d.semantic} suffix="/100" />,
              ],
            }))}
            minWidth={520}
          />
        </>
      )}
    </div>
  );
}

function Note({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'error' }) {
  return (
    <div
      style={{
        marginTop: 16,
        padding: '18px 16px',
        borderRadius: 'var(--msp-radius-card)',
        border: '1px solid var(--msp-border)',
        background: 'var(--msp-panel)',
        fontSize: '0.85rem',
        color: tone === 'error' ? 'var(--msp-bear)' : 'var(--msp-text-muted)',
      }}
    >
      {children}
    </div>
  );
}
