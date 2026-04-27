import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Portfolio Tracker',
  description:
    'Track open positions, performance, risk, and hypothetical exposure with an educational portfolio workflow in real-time.',
  openGraph: {
    title: 'Portfolio Tracker | MarketScanner Pros',
    description:
      'Track open positions, performance, risk, and hypothetical exposure with an educational portfolio workflow.',
    url: 'https://marketscannerpros.app/tools/portfolio',
    siteName: 'MarketScanner Pros',
    images: [{ url: '/scan-banner.png', width: 1200, height: 630, alt: 'MarketScanner Pros — Portfolio Tracker' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Portfolio Tracker | MarketScanner Pros',
    description:
      'Track open positions, performance, risk, and hypothetical exposure with an educational portfolio workflow.',
    images: ['/scan-banner.png'],
  },
  alternates: {
    canonical: 'https://marketscannerpros.app/tools/portfolio',
  },
};

export default function PortfolioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
