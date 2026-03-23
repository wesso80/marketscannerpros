import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Options Confluence Scanner | Trading Tools | MarketScanner Pros',
  description:
    'Strike and expiry analysis powered by time confluence scoring. Discover options setups with professional-level multi-timeframe alignment.',
};

export default function OptionsConfluenceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
