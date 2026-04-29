import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Equity Explorer | MarketScanner Pros',
  description:
    'Research equities with real-time quotes, technical indicators, and fundamental data from Alpha Vantage.',
  robots: { index: false, follow: true },
  alternates: { canonical: 'https://marketscannerpros.app/tools/explorer?tab=equity' },
};

export default function EquityExplorerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
