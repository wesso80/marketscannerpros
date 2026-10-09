import type { Metadata } from 'next';
import { TITLE_TEMPLATE } from '@/lib/brandTitle';
import ToolsLayoutClient from './ToolsLayoutClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: {
    default: 'All tools',
    template: TITLE_TEMPLATE,
  },
  description:
    'The MarketScannerPros market research workflow: scan, validate, test, journal, monitor alerts, and review macro context. Educational tools only — no advice or execution.',
  alternates: {
    canonical: 'https://marketscannerpros.app/tools',
  },
  openGraph: {
    type: 'website',
    url: 'https://marketscannerpros.app/tools',
    title: 'All tools | MarketScannerPros',
    description:
      'Use the guided research sequence: find scenarios, validate evidence, test safely, track outcomes, and open specialist tools only when needed.',
    siteName: 'MarketScannerPros',
    images: [
      {
        url: '/scan-banner.png',
        width: 1200,
        height: 630,
        alt: 'MarketScannerPros workflow map',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'All tools | MarketScannerPros',
    description:
      'Use the guided research sequence: find scenarios, validate evidence, test safely, and track outcomes.',
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
