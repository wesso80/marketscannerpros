import type { Metadata } from 'next';
import ToolsLayoutClient from './ToolsLayoutClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: {
    default: 'Workflow',
    template: '%s | Workflow | MarketScanner Pros',
  },
  description:
    'The MSP market research workflow: scan, validate, test, journal, monitor alerts, and review macro context. Educational tools only — no advice or execution.',
  alternates: {
    canonical: '/tools',
  },
  openGraph: {
    type: 'website',
    url: 'https://marketscannerpros.app/tools',
    title: 'Workflow | MarketScanner Pros',
    description:
      'Use the guided research sequence: find scenarios, validate evidence, test safely, track outcomes, and open specialist tools only when needed.',
    siteName: 'MarketScanner Pros',
    images: [
      {
        url: '/scan-banner.png',
        width: 1200,
        height: 630,
        alt: 'MarketScanner Pros workflow map',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Workflow | MarketScanner Pros',
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
