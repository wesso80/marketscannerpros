import type { Metadata } from 'next';

export const metadata: Metadata = {
  alternates: { canonical: 'https://marketscannerpros.app/tools/workspace?tab=portfolio' },
  title: 'Portfolio',
  description:
    'Track open positions, performance, risk, and hypothetical exposure with an educational portfolio workflow in real-time.',
  openGraph: {
    title: 'Portfolio Tracker | MarketScannerPros',
    description:
      'Track open positions, performance, risk, and hypothetical exposure with an educational portfolio workflow.',
    url: 'https://marketscannerpros.app/tools/workspace?tab=portfolio',
    siteName: 'MarketScannerPros',
    images: [{ url: '/scan-banner.png', width: 1200, height: 630, alt: 'MarketScannerPros — Portfolio Tracker' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Portfolio Tracker | MarketScannerPros',
    description:
      'Track open positions, performance, risk, and hypothetical exposure with an educational portfolio workflow.',
    images: ['/scan-banner.png'],
  },
  robots: { index: false, follow: false },
};

export default function PortfolioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
