import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Options Confluence Scanner | Trading Tools | MarketScanner Pros',
  description:
    'Strike and expiry recommendations powered by time confluence analysis. Discover optimal options setups with institutional-grade multi-timeframe alignment.',
};

export default function OptionsConfluenceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
