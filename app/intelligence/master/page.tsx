'use client';

import { useEndpoint } from '@/components/intelligence/useEndpoint';
import CommandStrip from '@/components/intelligence/CommandStrip';
import TriggerLadder from '@/components/intelligence/TriggerLadder';
import IntelligenceTable, { type IntelColumn, type IntelRow } from '@/components/intelligence/IntelligenceTable';
import {
  StateCell,
  ScoreCell,
  GateCell,
  MetricCell,
  SectionHeader,
  LastUpdatedBadge,
} from '@/components/intelligence/primitives';
import { gateToSemantic } from '@/lib/intelligence/states';
import type { MasterResult, EngineResult, ModuleDir, EngineStatusFlag, SemanticState } from '@/lib/intelligence/types';

const MODULE_DIR_SEMANTIC: Record<ModuleDir, SemanticState> = {
  LONG: 'positive',
  SHORT: 'negative',
  NEUTRAL: 'neutral',
};

const STATUS_SEMANTIC: Record<EngineStatusFlag, SemanticState> = {
  LIVE: 'positive',
  MOCK: 'warning',
  STALE: 'warning',
  UNAVAILABLE: 'negative',
};

const ENGINE_COLUMNS: IntelColumn[] = [
  { key: 'module', label: 'Module', align: 'left' },
  { key: 'raw', label: 'Raw Source', align: 'right', tooltip: 'Native engine reading before normalisation.' },
  { key: 'orientation', label: 'Orientation', align: 'right', tooltip: '0–100 long/risk-on orientation (50 = neutral).' },
  { key: 'state', label: 'State' },
  { key: 'weight', label: 'Weight', align: 'right', tooltip: 'Contribution weight to the Master composite.' },
  { key: 'support', label: 'Dir Support', align: 'right', tooltip: 'How strongly this engine supports the current directional thesis.' },
  { key: 'dir', label: 'Module Dir' },
  { key: 'gate', label: 'Gate' },
  { key: 'role', label: 'Role', align: 'left' },
  { key: 'status', label: 'Status' },
];

function fmt(n: number | undefined): string {
  return n === undefined ? '—' : n.toFixed(2);
}

function engineRow(engine: EngineResult): IntelRow {
  const dir = engine.moduleDir ?? 'NEUTRAL';
  return {
    id: engine.engine,
    cells: [
      <MetricCell key="m" align="left" strong title={engine.symbol ? `${engine.symbol} · ${engine.timeframe ?? ''}` : undefined}>{engine.label}</MetricCell>,
      <MetricCell key="r" align="right" muted>{fmt(engine.rawValue)}</MetricCell>,
      <ScoreCell key="o" value={engine.orientation.toFixed(2)} semantic={engine.semantic} />,
      <StateCell key="s" label={engine.state} semantic={engine.semantic} />,
      <MetricCell key="w" align="right" muted>{engine.weightPct}%</MetricCell>,
      <MetricCell key="d" align="right">{fmt(engine.dirSupport)}</MetricCell>,
      <StateCell key="md" label={dir} semantic={MODULE_DIR_SEMANTIC[dir]} />,
      <GateCell key="g" gate={engine.gate} />,
      <MetricCell key="ro" align="left" muted>{engine.role}</MetricCell>,
      <StateCell key="st" label={engine.status} semantic={STATUS_SEMANTIC[engine.status]} />,
    ],
    detail: <EngineDetail engine={engine} />,
  };
}

function EngineDetail({ engine }: { engine: EngineResult }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <Fact label="Current" value={engine.orientation.toFixed(2)} />
        <Fact label="Raw" value={fmt(engine.rawValue)} />
        <Fact label="Confidence" value={engine.confidence !== undefined ? `${Math.round(engine.confidence * 100)}%` : '—'} />
        <Fact label="Direction" value={engine.moduleDir ?? 'NEUTRAL'} />
      </div>
      {engine.components && engine.components.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {engine.components.map((c) => (
            <span key={c.label} style={{ fontSize: '0.74rem', color: 'var(--msp-text-muted)' }}>
              <strong style={{ color: 'var(--msp-text)' }}>{c.label}:</strong> {c.value}
              {c.detail ? ` (${c.detail})` : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ fontSize: '0.74rem', color: 'var(--msp-text-muted)' }}>
      <strong style={{ color: 'var(--msp-text)' }}>{label}:</strong> {value}
    </span>
  );
}

export default function MasterCommandCentre() {
  const { data, loading, error, updatedAt } = useEndpoint<MasterResult>('/api/intelligence/master');

  return (
    <div>
      <header style={{ marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--msp-text)' }}>Master Command Centre</h1>
        <p style={{ margin: '4px 0 0', fontSize: '0.86rem', color: 'var(--msp-text-muted)' }}>
          The primary decision view — five engines fused into one directional read.
        </p>
      </header>

      {loading && <Note>Loading Master Command Centre…</Note>}
      {error && <Note tone="error">Could not load: {error}</Note>}

      {data && (
        <>
          <SectionHeader title="Master Edge" right={<LastUpdatedBadge timestamp={updatedAt ?? undefined} />} />
          <CommandStrip
            items={[
              { label: 'Composite', value: data.composite, semantic: data.biasSemantic, tooltip: 'Weighted blend of all five engines (0–100, 50 = neutral).' },
              { label: 'Bias', value: data.bias, semantic: data.biasSemantic },
              { label: 'Edge', value: data.edgeLabel, semantic: 'warning', tooltip: 'A developing setup inside the watch zone. It is not an execution-ready signal.' },
              { label: 'Agreement', value: `${data.agreement}%`, semantic: 'warning', tooltip: 'Share of active engines aligned with the composite bias.' },
              { label: 'Risk', value: data.risk, semantic: data.riskSemantic },
              { label: 'Conflict', value: data.conflict, semantic: data.conflictSemantic, tooltip: 'Divergence between context (macro/structure) and execution (pressure/auction).' },
              { label: 'Playbook', value: data.playbook, semantic: data.playbookSemantic },
            ]}
          />

          <SectionHeader title="Five Engines" subtitle="Select a row to expand the underlying components." />
          <IntelligenceTable columns={ENGINE_COLUMNS} rows={data.engines.map(engineRow)} stickyFirst minWidth={960} />

          <SectionHeader title="Decision Gates" />
          <CommandStrip
            items={data.gates.map((g) => ({ label: g.label, value: g.state, semantic: gateToSemantic(g.state) }))}
          />

          <SectionHeader title="Context / Execution" />
          <CommandStrip
            items={[
              { label: 'Context', value: data.context, semantic: 'positive', tooltip: 'Macro + market-structure support.' },
              { label: 'Execution', value: data.execution, semantic: 'warning', tooltip: 'Pressure + auction support.' },
              { label: 'Gap', value: data.gap, semantic: 'warning', tooltip: 'Distance between context and execution.' },
              { label: 'Conflict', value: data.conflict, semantic: data.conflictSemantic },
            ]}
          />

          <SectionHeader title="Trigger Ladder" subtitle="How close every required condition is to passing." />
          <TriggerLadder ladder={data.ladder} />
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
