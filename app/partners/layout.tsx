import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Partners',
  description: 'Partnership options for brokers, educators, communities, and research teams using MarketScannerPros educational analysis workflows.',
  alternates: { canonical: '/partners' },
  openGraph: {
    title: 'MarketScannerPros Partners',
    description: 'Partner with MarketScannerPros for educational market analysis workflows and platform integrations.',
    url: 'https://marketscannerpros.app/partners',
    siteName: 'MarketScannerPros',
    images: [{ url: '/scan-banner.png', width: 1200, height: 630, alt: 'MarketScannerPros partners' }],
  },
  twitter: { card: 'summary_large_image', images: ['/scan-banner.png'] },
};

export default function PartnersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
