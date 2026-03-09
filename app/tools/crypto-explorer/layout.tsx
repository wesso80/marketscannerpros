import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Crypto Explorer | MarketScanner Pros',
  description:
    'Explore cryptocurrency assets with real-time prices, charts, and market data powered by CoinGecko.',
};

export default function CryptoExplorerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
