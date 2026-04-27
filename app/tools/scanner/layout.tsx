import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Market Scanner',
  description:
    'Scan equities, crypto, and forex with technical indicators, regime context, data-quality warnings, and educational scenario analysis.',
  openGraph: {
    title: 'Market Scanner | MarketScanner Pros',
    description:
      'Scan equities, crypto, and forex with technical indicators, regime context, data-quality warnings, and educational scenario analysis.',
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
      'Ranked market scanner with regime context and educational scenario analysis.',
    images: ['/scan-banner.png'],
  },
  alternates: {
    canonical: 'https://marketscannerpros.app/tools/scanner',
  },
};

export default function ScannerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
