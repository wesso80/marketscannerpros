import type { Metadata } from 'next';
import ToolsLayoutClient from './ToolsLayoutClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: {
    default: 'Trading Tools',
    template: '%s | Trading Tools | MarketScanner Pros',
  },
  description:
    'Workflow-first market research toolkit: scan, validate, test, journal. Educational tools only — no advice or execution.',
  alternates: {
    canonical: '/tools',
  },
  openGraph: {
    type: 'website',
    url: 'https://marketscannerpros.app/tools',
    title: 'Trading Tools | MarketScanner Pros',
    description:
      'Use MSP in one clear sequence: find scenarios, validate evidence, test safely, track outcomes.',
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
      'Use MSP in one clear sequence: find scenarios, validate evidence, test safely, track outcomes.',
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
