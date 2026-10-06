'use client';

import { useEndpoint } from '@/components/intelligence/useEndpoint';
import CollapsibleSection from '@/components/visual/CollapsibleSection';
import SourceLine from '@/components/visual/SourceLine';
import { EvidenceBars, EvidenceMetrics as CommandStrip, EvidenceVerdict, EvidenceWarning, evidenceLabel } from '@/components/intelligence/CompactEvidence';

import IntelligenceTable, { type IntelColumn, type IntelRow } from '@/components/intelligence/IntelligenceTable';
import {
  StateCell, ScoreCell, MetricCell, SectionHeader,
} from '@/components/intelligence/primitives';
import { orientationToSemantic, riskToSemantic } from '@/lib/intelligence/states';
import type { SemanticState } from '@/lib/intelligence/types';
import { m2BlocCoverage, m2BlocName, notCollectedText } from '@/lib/intelligence/m2Coverage';
import type {
  LiquidityTransmissionPageDto,
  LiquidityStageDto,
  LiquiditySourceRowDto,
  StageGate,
} from '@/lib/intelligence/liquidityTransmissionPageMapper';

// Phase 4D — Liquidity Transmission page. Zero mock, zero hard-coded
// live-looking values. All numbers come from resolveLiquidityTransmission()
// via the pure page mapper. Parity is always DATA_PARITY_PENDING.

const STAGE_COLUMNS: IntelColumn[] = [
  { key: 'stage', label: 'Stage', align: 'left' },
  { key: 'driver', label: 'Driver', align: 'left' },
  { key: 'grade', label: 'Grade', tooltip: 'Grade A/B from the M2 walk-forward research.' },
  { key: 'score', label: 'Score', align: 'right' },
  { key: 'state', label: 'State' },
  { key: 'gate', label: 'Gate' },
  { key: 'active', label: 'Clock position' },
];

const SOURCE_COLUMNS: IntelColumn[] = [
  { key: 'sym', label: 'Symbol', align: 'left' },
  { key: 'source', label: 'Source', align: 'left' },
  { key: 'class', label: 'Class', align: 'left', tooltip: 'EXACT = 1:1 provider match. PROXY = ETF stand-in. ALTERNATIVE = same underlying, different venue. DERIVED = computed from other series.' },
  { key: 'status', label: 'Status', align: 'left' },
  { key: 'latest', label: 'Latest bar', align: 'right' },
];

export default function LiquidityPage() {
  const { data, loading, error, updatedAt } =
    useEndpoint<LiquidityTransmissionPageDto>('/api/intelligence/liquidity');

  return (
    <div>
      <header style={{ marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--msp-text)' }}>
          Liquidity Transmission
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '0.86rem', color: 'var(--msp-text-muted)' }}>
          Cross-asset validated liquidity, the 8-stage rotation clock, and downstream risk appetite &mdash; all from the
          existing observations. Research-only; some inputs use proxies, alternatives or derived data (see Data Quality).
        </p>
      </header>

      {loading && <Note>Loading Liquidity Transmission&hellip;</Note>}
      {error && <Note tone="error">Could not load: {error}</Note>}

      {data && <PageBody data={data} updatedAt={updatedAt} />}
    </div>
  );
}

function PageBody({ data, updatedAt }: { data: LiquidityTransmissionPageDto; updatedAt: string | null }) {
  const h = data.headline;
  return <>
    <EvidenceVerdict>{data.available && h ? evidenceLabel(h.clockContext) : 'Liquidity observations could not be collected.'}</EvidenceVerdict>
    {data.available && h && <>
      <CommandStrip items={[
        { label: 'Transmission', value: h.masterLink },
        { label: 'Validated', value: h.validated },
        { label: 'Downstream', value: h.downstream },
        { label: 'Evidence quality', value: h.confidence },
      ]} />
      <EvidenceBars title="Eight-stage rotation · score / 100" rows={data.stages.map(s => ({ label: `${s.stage}. ${shortStageName(s.name, s.stage)}`, value: s.score }))} maximum={100} />
    </>}
    <EvidenceWarning>{data.quality.missingInputCount ? `${data.quality.missingInputCount} daily inputs not collected · ` : ''}{notCollectedText('M2 blocs', data.m2Upstream.missingBlocs.map(b => m2BlocName(b, evidenceLabel)))} · {evidenceLabel(data.parityStatus)}{data.quality.staleInputCount ? ` · ${data.quality.staleInputCount} inputs use older observations` : ''}{data.reason ? ` · ${evidenceLabel(data.reason)}` : ''}</EvidenceWarning>
    <CollapsibleSection title="Transmission evidence" summary={`${data.stages.length} stages · ${data.quality.coveragePercent.toFixed(1)}% input coverage`}>
      {data.available && h && <>
        <HeadlinePanel data={data} updatedAt={updatedAt} />
        {data.alerts && <AlertsRow data={data} />}
        {data.stage8Explanation && <Stage8Panel data={data} />}
        <StageClockPanel data={data} />
        <DownstreamVsValidatedPanel data={data} />
        <M2UpstreamPanel data={data} />
        <PlaybookPanel data={data} />
        <HistoryPanel data={data} />
      </>}
      <QualityPanel data={data} />
    </CollapsibleSection>
    <SourceLine source={evidenceLabel(data.quality.providersUsed.join(', ') || 'Source not collected')} asOf={data.calculatedAt} basis="Calculation time · confirmed daily observations and monthly M2 · source observation dates in details" />
  </>;
}

/* ── Headline panel ───────────────────────────────────────────────────────── */

function HeadlinePanel({ data, updatedAt }: { data: LiquidityTransmissionPageDto; updatedAt: string | null }) {
  const h = data.headline!;
  return (
    <>
      <SectionHeader
        title="Transmission Headline"

      />
      <CommandStrip
        items={[
          {
            label: 'Master Link',
            value: h.masterLink.toFixed(1),
            semantic: orientationToSemantic(h.masterLink),
            tooltip: 'Native transmissionRiskOn — 0.35·m2Bias + 0.65·validated.',
          },
          { label: 'Flow', value: h.flow, semantic: orientationToSemantic(h.masterLink) },
          {
            label: 'Clock',
            value: h.clockContext,
            semantic: h.stage8Active ? 'warning' : 'neutral',
          },
          { label: 'Cycle', value: h.liquidityCycle, semantic: 'neutral' },
          {
            label: 'Validated',
            value: h.validated.toFixed(1),
            semantic: orientationToSemantic(h.validated),
            tooltip: 'Cross-asset confirmation from Grade A + Grade B validated drivers.',
          },
          {
            label: 'Downstream',
            value: h.downstream.toFixed(1),
            semantic: orientationToSemantic(h.downstream),
          },
          {
            label: 'Gap',
            value: `${h.riskLiquidityGap >= 0 ? '+' : ''}${h.riskLiquidityGap.toFixed(1)}`,
            semantic: riskToSemantic(Math.abs(h.riskLiquidityGap) + 30),
            tooltip: 'Downstream − Master Link (0.35 × M2 bias + 0.65 × validated). Positive = risk appetite ahead of transmission.',
          },
        ]}
      />
      <div style={{ height: 8 }} />
      <CommandStrip
        items={[
          {
            label: 'Late-cycle',
            value: `${h.lateCycleScore.toFixed(1)} ${h.lateCycleState}`,
            semantic: riskToSemantic(h.lateCycleScore),
          },
          {
            label: 'Early warning',
            value: `${h.earlyWarningRisk.toFixed(1)} ${h.earlyWarningState}`,
            semantic: riskToSemantic(h.earlyWarningRisk),
          },
          {
            label: 'Evidence quality',
            value: `${h.confidence} ${h.confidenceLabel}`,
            semantic:
              h.confidenceLabel === 'HIGH'
                ? 'strong-positive'
                : h.confidenceLabel === 'MODERATE'
                ? 'positive'
                : 'warning',
          },
          {
            label: 'M2 bias',
            value: h.m2BiasScore.toFixed(1),
            semantic: orientationToSemantic(h.m2BiasScore),
          },
          {
            label: 'Divergence',
            value: h.divergenceState,
            semantic: h.stage8Active ? 'warning' : 'neutral',
          },
          { label: 'Crypto window', value: h.cryptoDelayWindow, semantic: 'neutral' },
        ]}
      />
    </>
  );
}

/* ── Alerts ───────────────────────────────────────────────────────────────── */

function AlertsRow({ data }: { data: LiquidityTransmissionPageDto }) {
  const a = data.alerts!;
  const chips: { label: string; active: boolean; tone: SemanticState }[] = [
    { label: 'Broad Risk-On', active: a.broadRiskOn, tone: 'strong-positive' },
    { label: 'Broad Risk-Off', active: a.broadRiskOff, tone: 'critical' },
    { label: 'Divergence Warning', active: a.divergenceWarning, tone: 'warning' },
    { label: 'Early Warning Elevated', active: a.earlyWarningElevated, tone: 'warning' },
    { label: 'Early Warning High', active: a.earlyWarningHigh, tone: 'critical' },
    { label: 'Crypto Window Active', active: a.cryptoWindowActive, tone: 'positive' },
  ];
  return (
    <>
      <SectionHeader
        title="Alerts"
        subtitle={`${a.activeCount} active · calculated conditions`}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {chips.map((c) => (
          <Chip key={evidenceLabel(c.label)} label={evidenceLabel(c.label)} tone={c.active ? c.tone : 'muted'} muted={!c.active} />
        ))}
      </div>
    </>
  );
}

/* ── Stage-8 explanation ──────────────────────────────────────────────────── */

function Stage8Panel({ data }: { data: LiquidityTransmissionPageDto }) {
  const s8 = data.stage8Explanation!;
  const active = s8.active;
  return (
    <>
      <SectionHeader
        title="Stage 8 · Late-Cycle / Divergence"
        subtitle={active ? 'ACTIVE' : 'INACTIVE'}
      />
      <div
        style={{
          padding: '12px 14px', borderRadius: 'var(--msp-radius-card)',
          border: `1px solid ${active ? 'var(--msp-warn, #d97706)' : 'var(--msp-border)'}`,
          background: 'var(--msp-panel)',
          display: 'grid', gap: 10, fontSize: '0.82rem', color: 'var(--msp-text)', lineHeight: 1.55,
        }}
      >
        <p style={{ margin: 0 }}>{s8.headline}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
          {s8.conditions.map((c) => (
            <div
              key={evidenceLabel(c.label)}
              style={{
                padding: '8px 10px', borderRadius: 6,
                border: `1px solid ${c.triggered ? 'var(--msp-warn, #d97706)' : 'var(--msp-border)'}`,
                background: c.triggered ? 'rgba(245,177,76,0.08)' : 'transparent',
              }}
            >
              <div
                style={{
                  fontSize: '0.72rem', letterSpacing: '0.04em', textTransform: 'uppercase',
                  color: c.triggered ? 'var(--msp-warn, #d97706)' : 'var(--msp-text-faint)',
                }}
              >
                {c.triggered ? 'Triggered' : 'Not triggered'}
              </div>
              <div style={{ fontWeight: 600, marginTop: 2 }}>{evidenceLabel(c.label)}</div>
              <div style={{ fontSize: '0.76rem', color: 'var(--msp-text-muted)', marginTop: 2 }}>{evidenceLabel(c.detail)}</div>
            </div>
          ))}
        </div>
        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--msp-text-muted)' }}>{s8.active ? 'Late-cycle/divergence risk elevated. Research signal only; a reset or new cycle has not been confirmed.' : evidenceLabel(s8.guidance)}</p>
      </div>
    </>
  );
}

/* ── 8-stage clock table ──────────────────────────────────────────────────── */

function StageClockPanel({ data }: { data: LiquidityTransmissionPageDto }) {
  const rows: IntelRow[] = data.stages.map((s) => ({
    id: `stage-${s.stage}`,
    cells: [
      <MetricCell key="st" align="left" strong>{s.stage}. {shortStageName(s.name, s.stage)}</MetricCell>,
      <MetricCell key="dr" align="left" muted>{evidenceLabel(s.driver)}</MetricCell>,
      <MetricCell key="gr" align="left">{evidenceLabel(s.grade)}</MetricCell>,
      <ScoreCell key="sc" value={s.score.toFixed(1)} semantic={stageSemantic(s)} suffix="/100" />,
      <StateCell key="sta" label={evidenceLabel(s.state)} semantic={stageSemantic(s)} />,
      <StateCell key="ga" label={evidenceLabel(s.gate)} semantic={gateSemantic(s.gate)} />,
      <MetricCell key="ac" align="center" muted>{s.active ? 'Current' : '—'}</MetricCell>,
    ],
  }));
  return (
    <>
      <SectionHeader
        title="Eight-Stage Rotation Clock"
        subtitle="The clock sits at the furthest stage whose gate passes, so only one stage is current. An earlier stage can score higher without being current; Stage 8 overrides when its four conditions hold."
      />
      <IntelligenceTable columns={STAGE_COLUMNS} rows={rows} stickyFirst minWidth={840} />
    </>
  );
}

function shortStageName(name: string, stage: number): string {
  const fallback = [
    'Liquidity Ignition', 'USD Release', 'Credit Easing', 'Cyclical / Global Breadth',
    'US Risk Transmission', 'Crypto Majors', 'Alt Expansion', 'Late-Cycle / Divergence',
  ];
  return name && name !== 'n/a' ? name : fallback[stage - 1] ?? name;
}

/* ── Downstream vs Validated ──────────────────────────────────────────────── */

function DownstreamVsValidatedPanel({ data }: { data: LiquidityTransmissionPageDto }) {
  const h = data.headline!;
  return (
    <>
      <SectionHeader title="Downstream vs Master Link" subtitle="Gap = Downstream − Master Link; the validated component is shown separately in the headline." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
        <Metric label="Master Link" value={h.masterLink.toFixed(1)} tone={orientationToSemantic(h.masterLink)} />
        <Metric label="Downstream" value={h.downstream.toFixed(1)} tone={orientationToSemantic(h.downstream)} />
        <Metric
          label="Risk–Liquidity Gap"
          value={`${h.riskLiquidityGap >= 0 ? '+' : ''}${h.riskLiquidityGap.toFixed(1)}`}
          tone={Math.abs(h.riskLiquidityGap) >= 15 ? 'warning' : 'neutral'}
        />
        <Metric
          label="Divergence"
          value={h.divergenceState}
          tone={h.stage8Active ? 'warning' : 'neutral'}
        />
      </div>
    </>
  );
}

/* ── Global M2 upstream ───────────────────────────────────────────────────── */

function M2UpstreamPanel({ data }: { data: LiquidityTransmissionPageDto }) {
  const m = data.m2Upstream;
  const weighted = m.estimatedWeightedCoveragePercent;
  const eligible = m.interpretationEligible;
  return (
    <>
      <SectionHeader
        title="Global M2 Upstream"
        subtitle={eligible ? 'Interpretation eligible' : 'Interpretation ineligible · partial upstream'}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
        <Metric
          label="Bloc coverage"
          value={m2BlocCoverage(m.blocsAvailable, m.blocsTotal).label}
          hint="Blocs with a valid observation · same figure as Global M2"
          tone="neutral"
        />
        <Metric
          label="Weighted coverage of included blocs"
          value={weighted == null ? 'Not collected' : `${weighted.toFixed(1)}%`}
          hint={`Threshold ${m.interpretationThreshold}% for interpretation${m.coverageExcludedBlocs?.length ? ` · excl. ${m.coverageExcludedBlocs.join(', ')} (sources unavailable)` : ''}`}
          tone={weighted != null && weighted >= m.interpretationThreshold ? 'positive' : 'warning'}
        />
        <Metric label="Upstream status" value={m.status} tone="neutral" />
        <Metric label="Source checks" value={m.parityStatus} tone="warning" />
      </div>
      {(m.missingBlocs.length > 0 || m.providersUsed.length > 0) && (
        <div style={{ marginTop: 8, fontSize: '0.76rem', color: 'var(--msp-text-muted)', lineHeight: 1.5 }}>
          {m.missingBlocs.length > 0 && (
            <div>
              <strong style={{ color: 'var(--msp-text)' }}>Blocs not collected:</strong>{' '}
              {m.missingBlocs.map(b => m2BlocName(b, evidenceLabel)).join(', ')}
            </div>
          )}
          {m.providersUsed.length > 0 && (
            <div>
              <strong style={{ color: 'var(--msp-text)' }}>Providers used:</strong>{' '}
              {m.providersUsed.join(' · ')}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* ── Playbook ─────────────────────────────────────────────────────────────── */

function PlaybookPanel({ data }: { data: LiquidityTransmissionPageDto }) {
  if (!data.playbook) return null;
  return (
    <>
      <SectionHeader title="Research context" subtitle="Calculated · research language" />
      <div
        style={{
          padding: '12px 14px', borderRadius: 'var(--msp-radius-card)',
          border: '1px solid var(--msp-border)', background: 'var(--msp-panel)',
          fontSize: '0.83rem', color: 'var(--msp-text)', lineHeight: 1.55,
        }}
      >
        {evidenceLabel(data.playbook)}
      </div>
    </>
  );
}

/* ── History delta ────────────────────────────────────────────────────────── */

function HistoryPanel({ data }: { data: LiquidityTransmissionPageDto }) {
  const h = data.history;
  const current = data.headline?.masterLink;
  return (
    <>
      <SectionHeader
        title="History"
        subtitle={h.historyBuilding ? 'History building' : 'Master Link Δ vs prior confirmed bar'}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
        <Metric
          label="Current Master Link"
          value={current != null ? current.toFixed(1) : 'Not collected'}
          tone="neutral"
        />
        <Metric
          label="Previous Master Link"
          value={h.previousMasterLink != null ? h.previousMasterLink.toFixed(1) : 'Not collected'}
          hint={h.previousObservedOn ? `Observed ${h.previousObservedOn}` : 'No prior observation'}
          tone="neutral"
        />
        <Metric
          label="Δ (5D)"
          value={
            h.masterLinkDelta != null
              ? `${h.masterLinkDelta >= 0 ? '+' : ''}${h.masterLinkDelta.toFixed(1)}`
              : 'History building'
          }
          tone={
            h.masterLinkDelta == null
              ? 'warning'
              : h.masterLinkDelta >= 0
              ? 'positive'
              : 'warning'
          }
        />
      </div>
    </>
  );
}

/* ── Data quality panel (secondary, collapsed by default) ─────────────────── */

function QualityPanel({ data }: { data: LiquidityTransmissionPageDto }) {
  const q = data.quality;
  const rows: IntelRow[] = q.sources.map((src) => ({
    id: `src-${src.key}`,
    cells: [
      <MetricCell key="s" align="left" strong title={src.pineSymbol}>{src.pineSymbol}</MetricCell>,
      <MetricCell key="so" align="left" muted title={src.sourceName}>
        {src.providerSymbol} · {src.provider}
      </MetricCell>,
      <StateCell
        key="c"
        label={evidenceLabel(src.classification)}
        semantic={classSemantic(src)}
        title={src.classification === 'DERIVED' ? src.note : src.reason}
      />,
      <MetricCell key="st" align="left" muted>
        {src.missing ? 'Not collected' : src.stale ? 'Older observation' : evidenceLabel(src.status)}
      </MetricCell>,
      <MetricCell key="lb" align="right" muted>{src.latestDaily ?? 'Not collected'}</MetricCell>,
    ],
  }));
  return (
    <details style={{ marginTop: 20 }}>
      <summary
        style={{
          cursor: 'pointer', fontSize: '0.78rem', letterSpacing: '0.14em',
          textTransform: 'uppercase', color: 'var(--msp-text-muted)', fontWeight: 700, padding: '8px 0',
        }}
      >
        Data Quality &amp; Source Classification
      </summary>
      <div style={{ padding: '8px 0 4px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 12 }}>
          <MiniStat label="Exact" value={q.exactInputCount} />
          <MiniStat label="Alternative" value={q.alternativeInputCount} />
          <MiniStat label="Proxy" value={q.proxyInputCount} />
          <MiniStat label="Derived" value={q.derivedInputCount} />
          <MiniStat label="Missing" value={q.missingInputCount} />
          <MiniStat label="Stale" value={q.staleInputCount} />
          <MiniStat label="Coverage" value={`${q.coveragePercent.toFixed(1)}%`} />
          <MiniStat label="Providers" value={q.providersUsed.length > 0 ? q.providersUsed.join(', ') : 'Not collected'} />
        </div>
        <IntelligenceTable columns={SOURCE_COLUMNS} rows={rows} minWidth={680} />
        {q.sources.some((s) => s.classification === 'DERIVED') && (
          <p style={{ marginTop: 10, fontSize: '0.74rem', color: 'var(--msp-text-faint)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--msp-text-muted)' }}>TOTAL2 · Derived:</strong>{' '}
            {q.sources.find((s) => s.classification === 'DERIVED')?.note}
          </p>
        )}
      </div>
    </details>
  );
}

/* ── Small primitives (page-local) ────────────────────────────────────────── */

type ChipTone = SemanticState | 'muted';

function Chip({
  label, tone = 'neutral', muted = false, title,
}: {
  label: string; tone?: ChipTone; muted?: boolean; title?: string;
}) {
  const styleByTone: Record<string, { bg: string; fg: string; border: string }> = {
    'strong-positive': { bg: 'rgba(16,185,129,0.20)', fg: '#6EE7B7', border: 'rgba(16,185,129,0.38)' },
    positive:          { bg: 'rgba(52,211,153,0.12)', fg: '#34D399', border: 'rgba(52,211,153,0.28)' },
    neutral:           { bg: 'rgba(151,161,178,0.12)', fg: '#B4BDCB', border: 'rgba(151,161,178,0.22)' },
    warning:           { bg: 'rgba(245,177,76,0.15)',  fg: '#F5B14C', border: 'rgba(245,177,76,0.32)' },
    negative:          { bg: 'rgba(248,113,113,0.15)', fg: '#F87171', border: 'rgba(248,113,113,0.32)' },
    critical:          { bg: 'rgba(220,38,38,0.24)',   fg: '#FCA5A5', border: 'rgba(220,38,38,0.48)' },
    muted:             { bg: 'transparent', fg: 'var(--msp-text-faint)', border: 'var(--msp-border)' },
  };
  const s = styleByTone[muted ? 'muted' : (tone as string)] ?? styleByTone.neutral;
  return (
    <span
      title={title}
      style={{
        display: 'inline-block', padding: '3px 10px', borderRadius: 6, fontWeight: 600,
        fontSize: '0.72rem', letterSpacing: '0.04em',
        color: s.fg, background: s.bg, border: `1px solid ${s.border}`,
      }}
    >
      {evidenceLabel(label)}
    </span>
  );
}

function Metric({
  label, value, hint, tone = 'neutral',
}: {
  label: string; value: string; hint?: string; tone?: SemanticState;
}) {
  const palette: Record<SemanticState, string> = {
    'strong-positive': '#6EE7B7', positive: '#34D399', neutral: 'var(--msp-text)',
    warning: '#F5B14C', negative: '#F87171', critical: '#FCA5A5',
  };
  return (
    <div
      style={{
        padding: '10px 12px', borderRadius: 'var(--msp-radius-card)',
        border: '1px solid var(--msp-border)', background: 'var(--msp-panel)',
      }}
    >
      <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--msp-text-faint)' }}>
        {evidenceLabel(label)}
      </div>
      <div
        style={{
          fontSize: '1rem', fontWeight: 700, color: palette[tone] ?? palette.neutral,
          fontVariantNumeric: 'tabular-nums', marginTop: 2,
        }}
      >
        {evidenceLabel(value)}
      </div>
      {hint && (
        <div style={{ fontSize: '0.7rem', color: 'var(--msp-text-faint)', marginTop: 2 }}>{evidenceLabel(hint)}</div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        padding: '6px 10px', borderRadius: 6, border: '1px solid var(--msp-border)',
        background: 'transparent',
      }}
    >
      <div style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--msp-text-faint)' }}>
        {evidenceLabel(label)}
      </div>
      <div
        style={{
          fontSize: '0.82rem', fontWeight: 600, color: 'var(--msp-text)',
          marginTop: 2, fontVariantNumeric: 'tabular-nums',
        }}
      >
        {evidenceLabel(value)}
      </div>
    </div>
  );
}

function Note({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'error' }) {
  return (
    <div
      style={{
        marginTop: 16, padding: '18px 16px', borderRadius: 'var(--msp-radius-card)',
        border: '1px solid var(--msp-border)', background: 'var(--msp-panel)',
        fontSize: '0.85rem', color: tone === 'error' ? 'var(--msp-bear)' : 'var(--msp-text-muted)',
      }}
    >
      {children}
    </div>
  );
}

/* ── Semantic helpers ─────────────────────────────────────────────────────── */

function stageSemantic(s: LiquidityStageDto): SemanticState {
  if (s.stage === 8) return riskToSemantic(s.score);
  return orientationToSemantic(s.score);
}

function gateSemantic(gate: StageGate): SemanticState {
  switch (gate) {
    case 'PASS': return 'strong-positive';
    case 'PARTIAL': return 'neutral';
    case 'FAIL': return 'negative';
    case 'ACTIVE': return 'warning';
    case 'WATCH': return 'warning';
    case 'CLEAR': return 'positive';
    case 'N/A':
    default: return 'neutral';
  }
}

function classSemantic(src: LiquiditySourceRowDto): SemanticState {
  switch (src.classification) {
    case 'EXACT': return 'strong-positive';
    case 'ALTERNATIVE': return 'positive';
    case 'PROXY': return 'warning';
    case 'DERIVED': return 'warning';
    default: return 'neutral';
  }
}
