import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Operator Dashboard | MarketScanner Pros',
  description:
    'Advanced trading command center with real-time risk governance, position tracking, regime analysis, and AI-powered operator coaching for professional traders.',
  alternates: {
    canonical: '/operator',
  },
  openGraph: {
    type: 'website',
    url: 'https://marketscannerpros.app/operator',
    title: 'Operator Dashboard | MarketScanner Pros',
    description:
      'Advanced trading command center with real-time risk governance, position tracking, regime analysis, and AI-powered operator coaching.',
    siteName: 'MarketScanner Pros',
    images: [
      {
        url: '/scan-banner.png',
        width: 1200,
        height: 630,
        alt: 'MarketScanner Pros Operator Dashboard',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Operator Dashboard | MarketScanner Pros',
    description:
      'Advanced trading command center with real-time risk governance and AI-powered operator coaching.',
    images: ['/scan-banner.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function OperatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
