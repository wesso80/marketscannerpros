'use client';

import { useEndpoint } from '@/components/intelligence/useEndpoint';
import IntelligenceTable, { type IntelColumn, type IntelRow } from '@/components/intelligence/IntelligenceTable';
import { MetricCell } from '@/components/intelligence/primitives';
import type { GlobalM2Dto } from '@/app/api/intelligence/global-m2/route';
import CollapsibleSection from '@/components/visual/CollapsibleSection';
import SourceLine from '@/components/visual/SourceLine';
import { EvidenceBars, EvidenceMetrics, EvidenceVerdict, EvidenceWarning, evidenceLabel } from '@/components/intelligence/CompactEvidence';
import { m2BlocCoverage, m2BlocName, notCollectedText } from '@/lib/intelligence/m2Coverage';

const T = (n: number) => `$${(n / 1e12).toFixed(2)}T`;
const pct = (n: number | null) => (n == null ? 'Not collected' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`);

const COLUMNS: IntelColumn[] = [
  { key: 'bloc', label: 'Bloc', align: 'left' },
  { key: 'class', label: 'Class', align: 'left', tooltip: 'EXACT = national M2; ALTERNATIVE = harmonised/estimate; PROXY = nearest aggregate.' },
  { key: 'health', label: 'Source', align: 'left', tooltip: 'LIVE = fetched this run; STALE = persisted last-known-good (provider outage).' },
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
      <MetricCell key="b" align="left" strong>{b.name}</MetricCell>,
      <MetricCell key="c" align="left" muted>{evidenceLabel(b.classification)}</MetricCell>,
      <MetricCell key="h" align="left" muted>{evidenceLabel(b.health)}</MetricCell>,
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
  const { data, loading, error } = useEndpoint<GlobalM2Dto>('/api/intelligence/global-m2');

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

      {data && !data.enabled && <EvidenceWarning><span data-layout-verdict>Global M2 observations are not collected in this environment.</span></EvidenceWarning>}
      {data?.enabled && <>
        <EvidenceVerdict>{data.interpretationEligible ? evidenceLabel(data.liquidityCycle) : 'Coverage is below the threshold for a Global M2 assessment.'}</EvidenceVerdict>
        <EvidenceMetrics items={[
          { label: 'Total M2 (USD)', value: T(data.totalUsd) },
          { label: 'Bloc coverage', value: m2BlocCoverage(data.validBlocCount, data.validBlocCount + data.missingBlocCount).label },
          { label: '1 month', value: pct(data.oneMonthPct) },
          { label: 'Year over year', value: pct(data.yoyPct) },
        ]} />
        <EvidenceBars title="M2 by economic bloc · USD" rows={data.blocs.map(b => ({ label: b.name, value: b.usdM2 }))} money />
        <EvidenceWarning>{notCollectedText('blocs', data.missing.map(m => m2BlocName(m.id, evidenceLabel)))} · {evidenceLabel(data.parityStatus)}{data.excludedBlocs?.length ? ` · ${data.excludedBlocs.map(b => b.name).join(', ')} excluded from weighted coverage` : ''}{data.blocs.some(b => b.stale) ? ' · Some observations use older saved data' : ''}</EvidenceWarning>
        <CollapsibleSection title="Show blocs" summary={`${data.validBlocCount} observations · ${data.weightedCoverageThreshold}% coverage required`}>
          <IntelligenceTable columns={COLUMNS} rows={data.blocs.map(blocRow)} />
          <EvidenceMetrics items={[
            { label: '3 month annualised', value: pct(data.threeMonthAnnualizedPct) },
            { label: 'Acceleration', value: evidenceLabel(data.accelerationState) },
            { label: 'Weighted coverage of included blocs', value: `${data.estimatedWeightedCoveragePercent.toFixed(1)}%` },
          ]} />
          {data.missing.length > 0 && <ul className="text-xs space-y-2">{data.missing.map(m => <li key={m.id}>{m.id}: {evidenceLabel(m.reason)}</li>)}</ul>}
        </CollapsibleSection>
      </>}
      {data && <SourceLine source="Official central-bank and statistics series" asOf={data.calculatedAt} basis={`Calculation time · lag-1 monthly USD M2 using last valid month-end FX${data.blocs.length ? ` · observation months ${[...new Set(data.blocs.map(b => b.observationMonth))].sort().join(', ')}` : ''}`} />}

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
