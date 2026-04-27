import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Market Scanner | Trading Tools | MarketScanner Pros',
  description:
    'Scan equities, crypto, and forex with 15+ technical indicators. Ranked candidates, decision cockpit, risk analysis, and AI-powered trade analysis.',
  openGraph: {
    title: 'Market Scanner | MarketScanner Pros',
    description:
      'Scan equities, crypto, and forex with 15+ technical indicators. Ranked candidates, decision cockpit, risk analysis, and AI-powered analysis.',
    url: 'https://marketscannerpros.app/tools/scanner',
    siteName: 'MarketScanner Pros',
    images: [
      {
        url: '/scan-banner.png',
        width: 1200,
        height: 630,
        alt: 'MarketScanner Pros — Market Scanner',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Market Scanner | MarketScanner Pros',
    description:
      'Scan equities, crypto, and forex with 15+ technical indicators. Ranked candidates, risk analysis, and AI analysis.',
    images: ['/scan-banner.png'],
  },
  alternates: {
    canonical: 'https://marketscannerpros.app/tools/scanner',
  },
};

export default function ScannerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
