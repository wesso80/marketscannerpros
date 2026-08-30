'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/intelligence', label: 'Overview' },
  { href: '/intelligence/master', label: 'Master' },
  { href: '/intelligence/liquidity', label: 'Liquidity' },
  { href: '/intelligence/fragility', label: 'Fragility' },
  { href: '/intelligence/lead-lag', label: 'Lead/Lag' },
  { href: '/intelligence/nq-pressure', label: 'NQ Pressure' },
  { href: '/intelligence/auction', label: 'Auction' },
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
        const active = tab.href === '/intelligence' ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
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
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
