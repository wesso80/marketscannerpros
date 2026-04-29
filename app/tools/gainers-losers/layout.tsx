import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Top Gainers & Losers | MarketScanner Pros',
  description:
    'Track the top gaining, losing, and most actively traded stocks in real-time with market context.',
  robots: { index: false, follow: true },
  alternates: { canonical: 'https://marketscannerpros.app/tools/explorer?tab=movers' },
};

export default function GainersLosersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
