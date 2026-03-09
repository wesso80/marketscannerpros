import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Portfolio Tracker | Trading Tools | MarketScanner Pros',
  description:
    'Track open positions, performance, risk, and position sizing with an active-trader portfolio workflow in real-time.',
  openGraph: {
    title: 'Portfolio Tracker | MarketScanner Pros',
    description:
      'Track open positions, performance, risk, and position sizing with an active-trader portfolio workflow.',
    url: 'https://app.marketscannerpros.app/tools/portfolio',
    siteName: 'MarketScanner Pros',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Portfolio Tracker | MarketScanner Pros',
    description:
      'Track open positions, performance, risk, and position sizing with an active-trader portfolio workflow.',
  },
  alternates: {
    canonical: 'https://app.marketscannerpros.app/tools/portfolio',
  },
};

export default function PortfolioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
