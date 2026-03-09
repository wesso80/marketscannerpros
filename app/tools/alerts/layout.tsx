import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Alert Intelligence | Trading Tools | MarketScanner Pros',
  description:
    'Smart price alerts with multi-condition logic, strategy-linked triggers, cooldown intelligence, and live trigger logging. Never miss a market event.',
  openGraph: {
    title: 'Alert Intelligence | MarketScanner Pros',
    description:
      'Smart price alerts with multi-condition logic, strategy-linked triggers, cooldown intelligence, and live trigger logging.',
    url: 'https://app.marketscannerpros.app/tools/alerts',
    siteName: 'MarketScanner Pros',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Alert Intelligence | MarketScanner Pros',
    description:
      'Smart price alerts with multi-condition logic, strategy-linked triggers, and live trigger logging.',
  },
  alternates: {
    canonical: 'https://app.marketscannerpros.app/tools/alerts',
  },
};

export default function AlertsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
