import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'How to Read Open Interest',
  description: 'Learn how to interpret Open Interest, Funding Rates, and Long/Short Ratios for educational crypto derivatives research.',
  keywords: ['open interest', 'crypto research', 'funding rates', 'long short ratio', 'derivatives education', 'bitcoin', 'ethereum'],
  openGraph: {
    title: 'How to Read Open Interest | MarketScannerPros',
    description: 'Learn how derivatives data can support educational crypto market research, including OI, funding rates, and L/S ratios.',
    type: 'article',
  },
};

export default function OpenInterestGuideLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
