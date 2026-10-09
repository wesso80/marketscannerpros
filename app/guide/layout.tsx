import type { Metadata } from 'next';
import { TITLE_TEMPLATE } from '@/lib/brandTitle';

export const metadata: Metadata = {
  title: { default: 'Guide', template: TITLE_TEMPLATE },
  description: 'Educational guides for using MarketScannerPros and interpreting market research workflows.',
  alternates: { canonical: '/guide' },
  openGraph: {
    title: 'MarketScannerPros Guide',
    description: 'Educational guides for platform workflows and market research concepts.',
    url: 'https://marketscannerpros.app/guide',
    siteName: 'MarketScannerPros',
    images: [{ url: '/scan-banner.png', width: 1200, height: 630, alt: 'MarketScannerPros educational guides' }],
  },
  twitter: { card: 'summary_large_image', images: ['/scan-banner.png'] },
};

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  return children;
}
