import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Top Gainers & Losers | MarketScanner Pros',
  description:
    'Track the top gaining, losing, and most actively traded stocks in real-time with market context.',
};

export default function GainersLosersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
