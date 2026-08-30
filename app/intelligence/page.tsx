'use client';

import { useEndpoint } from '@/components/intelligence/useEndpoint';
import EngineStatus from '@/components/intelligence/EngineStatus';
import { LastUpdatedBadge, SectionHeader } from '@/components/intelligence/primitives';
import type { EngineStatusRow } from '@/lib/intelligence/types';

export default function IntelligenceHome() {
  const { data, loading, error, updatedAt } = useEndpoint<EngineStatusRow[]>('/api/intelligence/status');

  return (
    <div>
      <header style={{ marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--msp-text)' }}>
          MarketScannerPros Intelligence
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '0.9rem', color: 'var(--msp-text-muted)' }}>
          Cross-asset liquidity, structure, capital-flow and execution intelligence.
        </p>
      </header>

      <SectionHeader
        title="Engine Status"
        subtitle="Live readout of every intelligence engine. Select a row to open its command page."
        right={<LastUpdatedBadge timestamp={updatedAt ?? undefined} />}
      />

      {loading && <StateBox>Loading engine status…</StateBox>}
      {error && <StateBox tone="error">Could not load engine status: {error}</StateBox>}
      {data && <EngineStatus rows={data} />}
    </div>
  );
}

function StateBox({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'error' }) {
  return (
    <div
      style={{
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
