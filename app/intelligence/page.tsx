'use client';

import Link from 'next/link';
import { LastUpdatedBadge, SectionHeader } from '@/components/intelligence/primitives';
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
          MarketScannerPros Intelligence
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '0.9rem', color: 'var(--msp-text-muted)' }}>
          Native cross-asset research. Only Global M2, Fragility and Liquidity Transmission are
          production-live today. The remaining modules are being converted to the native engine.
        </p>
      </header>

      <SectionHeader
        title="Live Now"
        subtitle="Native engines with live provider data. Parity marked DATA_PARITY_PENDING where source deltas apply."
        right={<LastUpdatedBadge timestamp={lastUpdated} />}
      />
      <ModuleGrid modules={liveModules} />

      <SectionHeader
        title="Coming Soon"
        subtitle="Under construction — no live output shown while native validation is in progress."
      />
      <ModuleGrid modules={COMING_SOON} />
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
        border: `1px solid ${live ? 'var(--msp-border)' : 'var(--msp-warn, #d97706)'}`,
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
        <StatusBadge status={m.status} />
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

function StatusBadge({ status }: { status: ModuleCard['status'] }) {
  const style =
    status === 'LIVE'
      ? { fg: '#6EE7B7', bg: 'rgba(16,185,129,0.20)', border: 'rgba(16,185,129,0.38)' }
      : status.startsWith('LIVE ·')
      ? { fg: '#34D399', bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.28)' }
      : status === 'CHECKING'
      ? { fg: '#94A3B8', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.25)' }
      : { fg: '#F5B14C', bg: 'rgba(245,177,76,0.15)', border: 'rgba(245,177,76,0.32)' };
  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: 6,
        fontSize: '0.68rem',
        letterSpacing: '0.04em',
        fontWeight: 700,
        color: style.fg,
        background: style.bg,
        border: `1px solid ${style.border}`,
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {status}
    </span>
  );
}
