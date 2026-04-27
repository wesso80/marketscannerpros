import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing — MarketScanner Pros',
  description:
    'Free, Pro ($25/mo), and Pro Trader ($50/mo) plans for educational market scanning, journaling, backtesting, and AI-assisted research. 7-day money-back guarantee.',
  alternates: { canonical: 'https://marketscannerpros.app/pricing' },
  openGraph: {
    title: 'Pricing — MarketScanner Pros',
    description:
      'Start free. Upgrade for unlimited scanning, AI analyst, backtesting, and Pro Trader research workflows.',
    url: 'https://marketscannerpros.app/pricing',
    type: 'website',
    images: [
      {
        url: '/scan-banner.png',
        width: 1200,
        height: 630,
        alt: 'MarketScanner Pros pricing plans',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pricing — MarketScanner Pros',
    description: 'Free, Pro, and Pro Trader plans for educational market research.',
    images: ['/scan-banner.png'],
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
