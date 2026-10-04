'use client';

import Link from 'next/link';
import CollapsibleSection from '@/components/visual/CollapsibleSection';
import ChipRow from '@/components/visual/ChipRow';
import SourceLine from '@/components/visual/SourceLine';
import StatTile from '@/components/visual/StatTile';
import { friendlyStatus } from '@/lib/free/friendlyStatus';
import { useEndpoint } from '@/components/intelligence/useEndpoint';
import type { GlobalM2Dto } from '@/app/api/intelligence/global-m2/route';
import type { FragilityResult } from '@/lib/intelligence/types';
import type { LiquidityTransmissionPageDto } from '@/lib/intelligence/liquidityTransmissionPageMapper';
import { fragilityStatusLabel, globalM2StatusLabel, liquidityStatusLabel, tileStatus } from '@/lib/intelligence/overviewStatus';

// Launch plan §4 — Intelligence overview cleanly separates the three
// production-live native modules from the roadmap. No mock data is shown.

interface ModuleCard {
  href: string;
  title: string;
  summary: string;
  /** Live modules: filled in from the module's own endpoint (same rule as its page); roadmap modules are fixed. */
  status: string;
}

const LIVE_NOW: ModuleCard[] = [
  {
    href: '/intelligence/global-m2',
    title: 'Global M2',
    summary:
      'USD-normalised national M2 across up to 11 economic blocs. Live from official central-bank + statistics sources.',
    status: 'CHECKING',
  },
  {
    href: '/intelligence/fragility',
    title: 'Market Fragility',
    summary:
      'Structural health / fragility composite with cross-asset rotation, credit, volatility and rates readings.',
    status: 'CHECKING',
  },
  {
    href: '/intelligence/liquidity',
    title: 'Liquidity Transmission',
    summary:
      'Validated cross-asset liquidity, 8-stage rotation clock, downstream risk appetite.',
    status: 'CHECKING',
  },
];

const COMING_SOON: ModuleCard[] = [
  {
    href: '/intelligence/lead-lag',
    title: 'Cross-Asset Lead/Lag',
    summary:
      'Predictive true-lead / synchronous-confirmation split over the NQ target. Formula parity complete; live NQ data pending.',
    status: 'UNDER CONSTRUCTION',
  },
  {
    href: '/intelligence/nq-pressure',
    title: 'NQ Institutional Pressure',
    summary:
      'Multi-timeframe pressure stack and session-aware cross-market confirmation. Native port not yet started.',
    status: 'UNDER CONSTRUCTION',
  },
  {
    href: '/intelligence/auction',
    title: 'NQ Auction',
    summary:
      'Auction-structure / entry-confirmation dashboard for the NQ contract. Native port not yet started.',
    status: 'UNDER CONSTRUCTION',
  },
  {
    href: '/intelligence/master',
    title: 'Master Command Centre',
    summary:
      'Cross-engine fusion. Public composite paused while Lead/Lag, Pressure and Auction remain non-native.',
    status: 'UNDER CONSTRUCTION',
  },
];

export default function IntelligenceHome() {
  // Tile badges read the same endpoints and rules as the module pages (each endpoint is cached in-process).
  const m2 = useEndpoint<GlobalM2Dto>('/api/intelligence/global-m2');
  const fragility = useEndpoint<FragilityResult>('/api/intelligence/fragility');
  const liquidity = useEndpoint<LiquidityTransmissionPageDto>('/api/intelligence/liquidity');
  const liveStatus: Record<string, string> = {
    '/intelligence/global-m2': tileStatus(m2, () => globalM2StatusLabel(m2.data)),
    '/intelligence/fragility': tileStatus(fragility, () => fragilityStatusLabel(fragility.data?.meta)),
    '/intelligence/liquidity': tileStatus(liquidity, () => liquidityStatusLabel(liquidity.data)),
  };
  const liveModules = LIVE_NOW.map((m) => ({ ...m, status: liveStatus[m.href] ?? m.status }));
  const lastUpdated = [m2.updatedAt, fragility.updatedAt, liquidity.updatedAt].filter((t): t is string => !!t).sort().pop();
  return (
    <div data-intelligence-overview>
      <Link href="/tools/command-center" className="inline-flex min-h-10 items-center text-sm hover:text-[var(--msp-accent)]">Open Overview</Link>
      <header style={{ marginBottom: 4 }}>
        <h1
          style={{
            margin: 0,
            fontSize: '1.35rem',
            fontWeight: 800,
            letterSpacing: '-0.01em',
            color: 'var(--msp-text)',
          }}
        >
          Intelligence
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '0.9rem', color: 'var(--msp-text-muted)' }}>
          Native cross-asset research. Only Global M2, Fragility and Liquidity Transmission are
          production-live today. The remaining modules are being converted to the native engine.
        </p>
      </header>

      <div className="my-4 max-w-xs"><StatTile label="Research modules" value={liveModules.length} /></div>
      <ChipRow items={liveModules.map(module => ({ id: module.href.split('/').pop()!, label: module.title, warning: module.status !== 'LIVE', detail: friendlyStatus(module.status) }))} />
      <SourceLine source="Intelligence modules" asOf={lastUpdated} basis="Latest module response; coverage varies by module" />
      <ModuleGrid modules={liveModules} />

      <CollapsibleSection title="Coming soon" summary="Modules in development">
        <ul className="space-y-2 text-sm">{COMING_SOON.map(module => <li key={module.href}>{module.title}</li>)}</ul>
      </CollapsibleSection>
    </div>
  );
}

function ModuleGrid({ modules }: { modules: ModuleCard[] }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 12,
      }}
    >
      {modules.map((m) => (
        <ModuleTile key={m.href} module={m} />
      ))}
    </div>
  );
}

function ModuleTile({ module: m }: { module: ModuleCard }) {
  const live = m.status !== 'UNDER CONSTRUCTION';
  return (
    <Link
      href={m.href}
      data-module-href={m.href}
      data-module-status={m.status}
      style={{
        display: 'block',
        padding: '14px 14px',
        borderRadius: 'var(--msp-radius-card)',
        border: `1px solid ${live ? 'var(--msp-border)' : 'var(--msp-warn)'}`,
        background: 'var(--msp-panel)',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span
          style={{
            fontSize: '0.92rem',
            fontWeight: 700,
            color: 'var(--msp-text)',
          }}
        >
          {m.title}
        </span>

      </div>
      <p
        style={{
          margin: '8px 0 0',
          fontSize: '0.8rem',
          color: 'var(--msp-text-muted)',
          lineHeight: 1.5,
        }}
      >
        {m.summary}
      </p>
    </Link>
  );
}
