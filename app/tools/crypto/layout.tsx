import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Crypto Command Center | MarketScanner Pros',
  description:
    'Real-time crypto intelligence dashboard with analysis gate, market overview, trending coins, DEX pools, DeFi stats, heatmaps, and sector rotation analysis.',
  robots: { index: false, follow: true },
  alternates: { canonical: 'https://marketscannerpros.app/tools/explorer?tab=crypto-command' },
};

export default function CryptoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
