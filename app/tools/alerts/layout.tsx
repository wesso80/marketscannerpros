import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Alert Intelligence',
  description:
    'Smart price alerts with multi-condition logic, strategy-linked triggers, cooldown intelligence, and live trigger logging. Never miss a market event.',
  openGraph: {
    title: 'Alert Intelligence | MarketScanner Pros',
    description:
      'Smart price alerts with multi-condition logic, strategy-linked triggers, cooldown intelligence, and live trigger logging.',
    url: 'https://marketscannerpros.app/tools/alerts',
    siteName: 'MarketScanner Pros',
    images: [{ url: '/scan-banner.png', width: 1200, height: 630, alt: 'MarketScanner Pros — Alert Intelligence' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Alert Intelligence | MarketScanner Pros',
    description:
      'Smart price alerts with multi-condition logic, strategy-linked triggers, and live trigger logging.',
    images: ['/scan-banner.png'],
  },
  alternates: {
    canonical: 'https://marketscannerpros.app/tools/alerts',
  },
};

export default function AlertsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
