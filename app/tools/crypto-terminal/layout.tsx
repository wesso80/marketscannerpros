import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Crypto Terminal | MarketScanner Pros',
  description:
    'Professional crypto trading terminal with real-time data, charts, and market analysis tools.',
  robots: { index: false, follow: true },
  alternates: { canonical: 'https://marketscannerpros.app/tools/terminal?tab=crypto' },
};

export default function CryptoTerminalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
