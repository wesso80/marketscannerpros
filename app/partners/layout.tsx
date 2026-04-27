import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Partners',
  description: 'Partnership options for brokers, educators, communities, and research teams using MarketScanner Pros educational analysis workflows.',
  alternates: { canonical: '/partners' },
  openGraph: {
    title: 'MarketScanner Pros Partners',
    description: 'Partner with MarketScanner Pros for educational market analysis workflows and platform integrations.',
    url: 'https://marketscannerpros.app/partners',
    siteName: 'MarketScanner Pros',
    images: [{ url: '/scan-banner.png', width: 1200, height: 630, alt: 'MarketScanner Pros partners' }],
  },
  twitter: { card: 'summary_large_image', images: ['/scan-banner.png'] },
};

export default function PartnersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
