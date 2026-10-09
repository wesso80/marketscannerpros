import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Scanner',
  description:
    'Scan equities and crypto with technical indicators, regime context, data-quality warnings, and educational scenario analysis.',
  openGraph: {
    title: 'Market Scanner | MarketScannerPros',
    description:
      'Scan equities and crypto with technical indicators, regime context, data-quality warnings, and educational scenario analysis.',
    url: 'https://marketscannerpros.app/tools/scanner',
    siteName: 'MarketScannerPros',
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
    title: 'Market Scanner | MarketScannerPros',
    description:
      'Scan stocks and crypto and review multi-timeframe indicator readings with the data shown for each symbol.',
    images: ['/scan-banner.png'],
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function ScannerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
