import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Guide',
  description: 'Educational guides for using MarketScanner Pros and interpreting market research workflows.',
  alternates: { canonical: '/guide' },
  openGraph: {
    title: 'MarketScanner Pros Guide',
    description: 'Educational guides for platform workflows and market research concepts.',
    url: 'https://marketscannerpros.app/guide',
    siteName: 'MarketScanner Pros',
    images: [{ url: '/scan-banner.png', width: 1200, height: 630, alt: 'MarketScanner Pros educational guides' }],
  },
  twitter: { card: 'summary_large_image', images: ['/scan-banner.png'] },
};

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  return children;
}
