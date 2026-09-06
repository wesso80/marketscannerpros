import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing — MarketScannerPros',
  description:
    'Two simple plans: Free to explore, and Pro ($24.99/month or $249/year) for the full platform — scanners, intelligence, research, backtesting and portfolio tools. 7-day money-back guarantee.',
  alternates: { canonical: 'https://marketscannerpros.app/pricing' },
  openGraph: {
    title: 'Pricing — MarketScannerPros',
    description:
      'Start free. Upgrade to Pro for the full MarketScannerPros platform — scanners, intelligence, research, backtesting and portfolio tools.',
    url: 'https://marketscannerpros.app/pricing',
    type: 'website',
    images: [
      {
        url: '/scan-banner.png',
        width: 1200,
        height: 630,
        alt: 'MarketScannerPros pricing plans',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pricing — MarketScannerPros',
    description: 'Two plans: Free and Pro. One paid plan, full access.',
    images: ['/scan-banner.png'],
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
