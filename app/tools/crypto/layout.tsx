import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Crypto Command Center | MarketScanner Pros',
  description:
    'Real-time crypto intelligence dashboard with deployment gate, market overview, trending coins, DEX pools, DeFi stats, heatmaps, and sector rotation analysis.',
};

export default function CryptoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
