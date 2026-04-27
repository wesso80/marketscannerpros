import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Watchlists',
  description:
    'Monitor and organize symbols for educational market scanning, watchlists, live quotes, and research workflow staging.',
  openGraph: {
    title: 'Watchlists | MarketScanner Pros',
    description:
      'Monitor and organize symbols for tactical scanning with live market data.',
    url: 'https://marketscannerpros.app/tools/watchlists',
    siteName: 'MarketScanner Pros',
    images: [{ url: '/scan-banner.png', width: 1200, height: 630, alt: 'MarketScanner Pros — Watchlists' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Watchlists | MarketScanner Pros',
    description:
      'Monitor and organize symbols for tactical scanning with live market data.',
    images: ['/scan-banner.png'],
  },
  alternates: {
    canonical: 'https://marketscannerpros.app/tools/watchlists',
  },
};

export default function WatchlistsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
