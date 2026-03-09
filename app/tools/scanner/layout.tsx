import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Market Scanner | Trading Tools | MarketScanner Pros',
  description:
    'Scan equities, crypto, and forex with 15+ technical indicators. Ranked candidates, decision cockpit, risk governor, and AI-powered trade analysis.',
  openGraph: {
    title: 'Market Scanner | MarketScanner Pros',
    description:
      'Scan equities, crypto, and forex with 15+ technical indicators. Ranked candidates, decision cockpit, risk governor, and AI-powered analysis.',
    url: 'https://app.marketscannerpros.app/tools/scanner',
    siteName: 'MarketScanner Pros',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Market Scanner | MarketScanner Pros',
    description:
      'Scan equities, crypto, and forex with 15+ technical indicators. Ranked candidates, risk governor, and AI analysis.',
  },
  alternates: {
    canonical: 'https://app.marketscannerpros.app/tools/scanner',
  },
};

export default function ScannerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
