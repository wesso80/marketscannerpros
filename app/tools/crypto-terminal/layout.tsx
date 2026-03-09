import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Crypto Terminal | MarketScanner Pros',
  description:
    'Professional crypto trading terminal with real-time data, charts, and market analysis tools.',
};

export default function CryptoTerminalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
