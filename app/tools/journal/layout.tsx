import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Trade Journal',
  description:
    'Educational trade journal for logging decisions, reviewing outcomes, tracking risk metrics, equity curves, and syncing process notes across devices.',
  openGraph: {
    title: 'Trade Journal | MarketScanner Pros',
    description:
      'Professional trade journal with live P&L tracking, risk metrics, equity curves, AI-powered analysis, and multi-device sync.',
    url: 'https://marketscannerpros.app/tools/workspace?tab=journal',
    siteName: 'MarketScanner Pros',
    images: [{ url: '/scan-banner.png', width: 1200, height: 630, alt: 'MarketScanner Pros — Trade Journal' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Trade Journal | MarketScanner Pros',
    description:
      'Educational trade journal for logging decisions, reviewing outcomes, and tracking risk metrics.',
    images: ['/scan-banner.png'],
  },
  alternates: {
    canonical: 'https://marketscannerpros.app/tools/workspace?tab=journal',
  },
  robots: { index: false, follow: true },
};

export default function JournalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
