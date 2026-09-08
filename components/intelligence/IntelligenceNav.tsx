'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Tab = { href: string; label: string; underConstruction?: boolean };

const TABS: Tab[] = [
  { href: '/intelligence', label: 'Overview' },
  { href: '/intelligence/global-m2', label: 'Global M2' },
  { href: '/intelligence/fragility', label: 'Fragility' },
  { href: '/intelligence/liquidity', label: 'Liquidity' },
  { href: '/intelligence/lead-lag', label: 'Lead/Lag', underConstruction: true },
  { href: '/intelligence/nq-pressure', label: 'NQ Pressure', underConstruction: true },
  { href: '/intelligence/auction', label: 'Auction', underConstruction: true },
  { href: '/intelligence/master', label: 'Master', underConstruction: true },
  { href: '/intelligence/history', label: 'History' },
];

export default function IntelligenceNav() {
  const pathname = usePathname() || '';

  return (
    <nav
      style={{
        display: 'flex',
        gap: 4,
        overflowX: 'auto',
        borderBottom: '1px solid var(--msp-border)',
        padding: '0 0 8px',
        marginBottom: 16,
      }}
    >
      {TABS.map((tab) => {
        const active = tab.href === '/intelligence'
          ? pathname === tab.href
          : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            data-nav-tab={tab.href}
            data-nav-status={tab.underConstruction ? 'UNDER_CONSTRUCTION' : 'LIVE'}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: '0.8rem',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              textDecoration: 'none',
              color: active ? 'var(--msp-accent)' : 'var(--msp-text-muted)',
              background: active ? 'var(--msp-accent-tint)' : 'transparent',
              border: active ? '1px solid var(--msp-accent)' : '1px solid transparent',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {tab.label}
            {tab.underConstruction && (
              <span
                title="Under construction — native engine in progress"
                style={{
                  padding: '1px 6px',
                  borderRadius: 5,
                  fontSize: '0.6rem',
                  letterSpacing: '0.04em',
                  fontWeight: 700,
                  color: '#F5B14C',
                  background: 'rgba(245,177,76,0.15)',
                  border: '1px solid rgba(245,177,76,0.32)',
                  textTransform: 'uppercase',
                }}
              >
                Soon
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
