'use client';

import Link from 'next/link';

// Public UNDER-CONSTRUCTION surface for Intelligence modules whose native
// engines are not yet live. Never shows mock scores, fake charts, stale
// TradingView screenshots, or synthetic live values (launch plan §3).

export interface IntelligenceUnderConstructionProps {
  moduleName: string;
  summary?: string;
  /** Optional secondary reassurance under the standard message. */
  detail?: string;
}

const LIVE_MODULES: { href: string; label: string }[] = [
  { href: '/intelligence/global-m2', label: 'Global M2' },
  { href: '/intelligence/fragility', label: 'Market Fragility' },
  { href: '/intelligence/liquidity', label: 'Liquidity Transmission' },
];

export default function IntelligenceUnderConstruction({
  moduleName,
  summary,
  detail,
}: IntelligenceUnderConstructionProps) {
  return (
    <div data-intelligence-under-construction={moduleName}>
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
          {moduleName}
        </h1>
        {summary && (
          <p style={{ margin: '4px 0 0', fontSize: '0.9rem', color: 'var(--msp-text-muted)' }}>
            {summary}
          </p>
        )}
      </header>

      <div
        style={{
          margin: '18px 0 0',
          padding: '28px 22px',
          borderRadius: 'var(--msp-radius-card)',
          border: '1px solid var(--msp-warn, #d97706)',
          background: 'var(--msp-panel)',
          display: 'grid',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              fontSize: '0.72rem',
              letterSpacing: '0.06em',
              fontWeight: 700,
              color: '#F5B14C',
              background: 'rgba(245,177,76,0.15)',
              border: '1px solid rgba(245,177,76,0.32)',
              textTransform: 'uppercase',
            }}
          >
            Under Construction
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--msp-text-faint)' }}>
            No live output shown while this module is being validated.
          </span>
        </div>

        <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--msp-text)', lineHeight: 1.55 }}>
          This intelligence module is currently being converted to the native MarketScannerPros
          engine.
        </p>
        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--msp-text-muted)', lineHeight: 1.55 }}>
          Live output will return after data and parity validation are complete. We do not display
          mock or placeholder scores in the meantime.
        </p>
        {detail && (
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--msp-text-muted)', lineHeight: 1.55 }}>
            {detail}
          </p>
        )}
      </div>

      <div
        style={{
          marginTop: 18,
          padding: '18px 20px',
          borderRadius: 'var(--msp-radius-card)',
          border: '1px solid var(--msp-border)',
          background: 'var(--msp-panel)',
        }}
      >
        <div
          style={{
            fontSize: '0.7rem',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--msp-text-muted)',
            fontWeight: 700,
            marginBottom: 10,
          }}
        >
          Available now
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {LIVE_MODULES.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid var(--msp-accent, #10B981)',
                color: 'var(--msp-accent, #10B981)',
                background: 'rgba(16,185,129,0.08)',
                fontSize: '0.82rem',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              {m.label} →
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
