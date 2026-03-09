import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Crypto Dashboard | MarketScanner Pros',
  description:
    'Monitor crypto market structure, derivatives context, and momentum signals in one actionable dashboard.',
};

export default function CryptoDashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
