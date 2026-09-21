import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Diamond Hunter | MarketScanner Pros',
  description: 'Early-stage crypto discovery using CoinGecko on-chain pool acceleration, liquidity, buyer activity and token-risk checks.',
  robots: { index: false, follow: false },
};

export default function DiamondHunterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
