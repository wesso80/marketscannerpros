import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import IntelligenceNav from '@/components/intelligence/IntelligenceNav';

export const metadata: Metadata = {
  title: 'Intelligence — Cross-Asset Market Command Centre',
  description:
    'Cross-asset liquidity, structure, capital-flow and execution intelligence. A professional research terminal that fuses macro liquidity, market fragility, cross-asset lead/lag, institutional pressure and auction structure into one command view.',
  robots: { index: true, follow: true },
};

export default function IntelligenceLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        maxWidth: 'var(--msp-content-wide)',
        margin: '0 auto',
        padding: '20px 16px 48px',
        width: '100%',
      }}
    >
      <IntelligenceNav />
      {children}
      <p
        style={{
          marginTop: 32,
          fontSize: '0.7rem',
          lineHeight: 1.5,
          color: 'var(--msp-text-faint)',
          borderTop: '1px solid var(--msp-border)',
          paddingTop: 12,
        }}
      >
        Educational and research use only. Scores are analytical composites summarising the current weight of
        evidence — they are not probabilities, forecasts, or personal financial advice. Values shown are development
        fixtures until the live engines are connected. Nothing here is an instruction to buy or sell any security.
      </p>
    </div>
  );
}
