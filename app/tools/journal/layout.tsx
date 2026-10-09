import type { Metadata } from 'next';

export const metadata: Metadata = {
  alternates: { canonical: 'https://marketscannerpros.app/tools/workspace?tab=journal' },
  title: 'Journal',
  description:
    'Educational trade journal for logging decisions, reviewing outcomes, tracking risk metrics, equity curves, and syncing process notes across devices.',
  openGraph: {
    title: 'Trade Journal | MarketScannerPros',
    description:
      'A journal for recording trades and notes. Open-position marks refresh from quotes about once a minute when a price is available, and open P&L is estimated before fees.',
    url: 'https://marketscannerpros.app/tools/workspace?tab=journal',
    siteName: 'MarketScannerPros',
    images: [{ url: '/scan-banner.png', width: 1200, height: 630, alt: 'MarketScanner Pros — Trade Journal' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Trade Journal | MarketScannerPros',
    description:
      'Educational trade journal for logging decisions, reviewing outcomes, and tracking risk metrics.',
    images: ['/scan-banner.png'],
  },
  robots: { index: false, follow: false },
};

export default function JournalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
