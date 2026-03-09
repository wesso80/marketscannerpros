import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Equity Explorer | MarketScanner Pros',
  description:
    'Research equities with real-time quotes, technical indicators, and fundamental data from Alpha Vantage.',
};

export default function EquityExplorerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
