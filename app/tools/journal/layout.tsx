import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Trade Journal | Trading Tools | MarketScanner Pros',
  description:
    'Professional trade journal with P&L tracking, risk metrics, equity curves, AI-powered data summaries, and multi-device sync. Log and review every trade.',
  openGraph: {
    title: 'Trade Journal | MarketScanner Pros',
    description:
      'Professional trade journal with live P&L tracking, risk metrics, equity curves, AI-powered analysis, and multi-device sync.',
    url: 'https://app.marketscannerpros.app/tools/journal',
    siteName: 'MarketScanner Pros',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Trade Journal | MarketScanner Pros',
    description:
      'Professional trade journal with live P&L tracking, risk metrics, equity curves, and AI-powered analysis.',
  },
  alternates: {
    canonical: 'https://app.marketscannerpros.app/tools/journal',
  },
};

export default function JournalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
