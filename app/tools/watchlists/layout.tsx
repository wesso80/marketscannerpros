import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Institutional Watchlist Engine | Trading Tools | MarketScanner Pros',
  description:
    'Monitor and organize symbols for tactical scanning with live market data. Stage ideas through confluence-ranked watchlists with real-time quotes.',
  openGraph: {
    title: 'Institutional Watchlist Engine | MarketScanner Pros',
    description:
      'Monitor and organize symbols for tactical scanning with live market data.',
    url: 'https://app.marketscannerpros.app/tools/watchlists',
    siteName: 'MarketScanner Pros',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Institutional Watchlist Engine | MarketScanner Pros',
    description:
      'Monitor and organize symbols for tactical scanning with live market data.',
  },
  alternates: {
    canonical: 'https://app.marketscannerpros.app/tools/watchlists',
  },
};

export default function WatchlistsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
