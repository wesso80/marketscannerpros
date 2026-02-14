import type { Metadata } from 'next';
import ToolsLayoutClient from './ToolsLayoutClient';

export const metadata: Metadata = {
  title: {
    default: 'Trading Tools',
    template: '%s | Trading Tools | MarketScanner Pros',
  },
  description:
    'Advanced market tools for scanner workflows, options confluence, portfolio tracking, heatmaps, earnings, macro, and AI-assisted analysis.',
  alternates: {
    canonical: '/tools',
  },
  openGraph: {
    type: 'website',
    url: 'https://marketscannerpros.app/tools',
    title: 'Trading Tools | MarketScanner Pros',
    description:
      'Advanced market tools for scanner workflows, options confluence, portfolio tracking, heatmaps, earnings, macro, and AI-assisted analysis.',
    siteName: 'MarketScanner Pros',
    images: [
      {
        url: '/scan-banner.png',
        width: 1200,
        height: 630,
        alt: 'MarketScanner Pros Trading Tools',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Trading Tools | MarketScanner Pros',
    description:
      'Advanced market tools for scanner workflows, options confluence, portfolio tracking, heatmaps, earnings, macro, and AI-assisted analysis.',
    images: ['/scan-banner.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function ToolsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ToolsLayoutClient>{children}</ToolsLayoutClient>;
}
