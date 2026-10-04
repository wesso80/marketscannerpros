import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Volatility' };

export default function VolatilityLayout({ children }: { children: React.ReactNode }) {
  return children;
}
