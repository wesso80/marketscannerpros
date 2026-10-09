import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Operator Dashboard | MarketScanner Pros',
  description:
    'Operator workspace for reviewing risk limits, open positions, and regime context.',
  alternates: {
    canonical: '/operator',
  },
  openGraph: {
    type: 'website',
    url: 'https://marketscannerpros.app/operator',
    title: 'Operator Dashboard | MarketScanner Pros',
    description:
      'Operator workspace for reviewing risk limits, open positions, and regime context.',
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
      'Operator workspace for reviewing risk limits and regime context.',
    images: ['/scan-banner.png'],
  },
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function OperatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
