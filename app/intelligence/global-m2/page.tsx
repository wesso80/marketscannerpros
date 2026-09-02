'use client';

import { useEndpoint } from '@/components/intelligence/useEndpoint';
import IntelligenceTable, { type IntelColumn, type IntelRow } from '@/components/intelligence/IntelligenceTable';
import { MetricCell, SectionHeader, LastUpdatedBadge } from '@/components/intelligence/primitives';
import type { GlobalM2Dto } from '@/app/api/intelligence/global-m2/route';

const T = (n: number) => `$${(n / 1e12).toFixed(3)}T`;
const pct = (n: number | null) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`);

const COLUMNS: IntelColumn[] = [
  { key: 'bloc', label: 'Bloc', align: 'left' },
  { key: 'class', label: 'Class', align: 'left', tooltip: 'EXACT = national M2; ALTERNATIVE = harmonised/estimate; PROXY = nearest aggregate.' },
  { key: 'usd', label: 'USD M2', align: 'right' },
  { key: 'share', label: 'Share', align: 'right' },
  { key: 'r1', label: '1M', align: 'right' },
  { key: 'r3', label: '3M', align: 'right' },
  { key: 'r12', label: 'YoY', align: 'right' },
  { key: 'month', label: 'Obs', align: 'right' },
];

function blocRow(b: GlobalM2Dto['blocs'][number]): IntelRow {
  return {
    id: b.id,
    cells: [
      <MetricCell key="b" align="left" strong>{b.name}{b.stale ? ' *' : ''}</MetricCell>,
      <MetricCell key="c" align="left" muted>{b.classification}</MetricCell>,
      <MetricCell key="u" align="right">{T(b.usdM2)}</MetricCell>,
      <MetricCell key="s" align="right" muted>{b.sharePct.toFixed(1)}%</MetricCell>,
      <MetricCell key="r1" align="right">{pct(b.r1)}</MetricCell>,
      <MetricCell key="r3" align="right">{pct(b.r3)}</MetricCell>,
      <MetricCell key="r12" align="right">{pct(b.r12)}</MetricCell>,
      <MetricCell key="m" align="right" muted>{b.observationMonth}</MetricCell>,
    ],
  };
}

export default function GlobalM2Page() {
  const { data, loading, error, updatedAt } = useEndpoint<GlobalM2Dto>('/api/intelligence/global-m2');

  return (
    <div>
      <header style={{ marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--msp-text)' }}>
          Global M2 Liquidity
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '0.9rem', color: 'var(--msp-text-muted)' }}>
          USD-normalized national M2 across up to 11 economic blocs, from official central-bank / statistics sources.
        </p>
      </header>

      {loading && <StateBox>Loading Global M2…</StateBox>}
      {error && <StateBox tone="error">Could not load Global M2: {error}</StateBox>}

      {data && !data.enabled && (
        <StateBox>
          Global M2 live pipeline is not enabled in this environment (set <code>INTELLIGENCE_LIVE_DATA</code>).
          Providers, normalization and the engine are ready; this view stays quiet until live data is switched on.
        </StateBox>
      )}

      {data && data.enabled && (
        <>
          {!data.interpretationEligible && (
            <div
              style={{
                margin: '4px 0 14px', padding: '10px 12px', borderRadius: 'var(--msp-radius-card)',
                border: '1px solid var(--msp-warn)', background: 'var(--msp-warn-tint, rgba(234,179,8,0.08))',
                fontSize: '0.8rem', color: 'var(--msp-text-muted)',
              }}
            >
              <strong style={{ color: 'var(--msp-text)' }}>DIAGNOSTIC — not the headline Global M2 regime.</strong>{' '}
              Estimated weighted coverage is {data.estimatedWeightedCoveragePercent.toFixed(1)}% (need ≥{data.weightedCoverageThreshold}%).
              With {data.missingBlocCount} bloc(s) missing, the cross-bloc cycle is shown for engineering diagnostics only.
              Parity: {data.parityStatus}.
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 16 }}>
            <Metric label="Total M2 (USD)" value={T(data.totalUsd)} />
            <Metric label="Blocs" value={`${data.validBlocCount} live · ${data.missingBlocCount} missing`} />
            <Metric label="Est. weighted coverage" value={`${data.estimatedWeightedCoveragePercent.toFixed(1)}%`} />
            <Metric label="1M" value={pct(data.oneMonthPct)} />
            <Metric label="3M annualised" value={pct(data.threeMonthAnnualizedPct)} />
            <Metric label="YoY" value={pct(data.yoyPct)} />
            <Metric label="Cycle (diagnostic)" value={data.liquidityCycle} />
            <Metric label="Acceleration" value={data.accelerationState} />
          </div>

          <SectionHeader
            title="Bloc Breakdown"
            subtitle="Lag-1 USD M2 per bloc (MONTH_END_LAST_VALID FX). * = provider flagged stale."
            right={<LastUpdatedBadge timestamp={updatedAt ?? undefined} />}
          />
          <IntelligenceTable columns={COLUMNS} rows={data.blocs.map(blocRow)} />

          {data.missing.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <SectionHeader title="Missing Blocs" subtitle="Fail-closed — no aggregate is ever silently substituted." />
              <ul style={{ margin: 0, padding: '4px 0 0 18px', fontSize: '0.78rem', color: 'var(--msp-text-muted)', lineHeight: 1.5 }}>
                {data.missing.map((m) => (
                  <li key={m.id}><strong style={{ color: 'var(--msp-text)' }}>{m.id}</strong>: {m.reason}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '10px 12px', borderRadius: 'var(--msp-radius-card)', border: '1px solid var(--msp-border)', background: 'var(--msp-panel)' }}>
      <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--msp-text-faint)' }}>{label}</div>
      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--msp-text)', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{value}</div>
    </div>
  );
}

function StateBox({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'error' }) {
  return (
    <div
      style={{
        padding: '18px 16px', borderRadius: 'var(--msp-radius-card)', border: '1px solid var(--msp-border)',
        background: 'var(--msp-panel)', fontSize: '0.85rem', color: tone === 'error' ? 'var(--msp-bear)' : 'var(--msp-text-muted)',
      }}
    >
      {children}
    </div>
  );
}
