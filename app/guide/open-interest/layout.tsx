import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'How to Read Open Interest | MarketScanner Pros Guide',
  description: 'Learn how to interpret Open Interest, Funding Rates, and Long/Short Ratios for crypto trading. Master derivatives data to gain an edge in the market.',
  keywords: ['open interest', 'crypto trading', 'funding rates', 'long short ratio', 'derivatives', 'futures trading', 'bitcoin', 'ethereum'],
  openGraph: {
    title: 'How to Read Open Interest | MarketScanner Pros',
    description: 'Master derivatives data to gain an edge in your crypto trading. Learn OI, funding rates, and L/S ratios.',
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
