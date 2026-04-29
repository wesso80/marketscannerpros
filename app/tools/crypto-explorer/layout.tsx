import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Crypto Explorer | MarketScanner Pros',
  description:
    'Explore cryptocurrency assets with real-time prices, charts, and market data powered by CoinGecko.',
  robots: { index: false, follow: true },
  alternates: { canonical: 'https://marketscannerpros.app/tools/explorer?tab=crypto' },
};

export default function CryptoExplorerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
