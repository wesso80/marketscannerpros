'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Tab = { href: string; label: string };

const TABS: Tab[] = [
  { href: '/intelligence', label: 'Overview' },
  { href: '/intelligence/global-m2', label: 'Global M2' },
  { href: '/intelligence/fragility', label: 'Fragility' },
  { href: '/intelligence/liquidity', label: 'Liquidity' },
];

export default function IntelligenceNav() {
  const pathname = usePathname() || '';

  return (
    <nav aria-label="Intelligence modules"
      style={{
        display: 'flex',
        gap: 4,
        flexWrap: 'wrap',
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
            data-nav-status="LIVE"
            aria-current={active ? 'page' : undefined}
            style={{
              padding: '8px 12px',
              minHeight: 40,
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

          </Link>
        );
      })}
    </nav>
  );
}
