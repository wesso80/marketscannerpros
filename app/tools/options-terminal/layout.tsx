import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Options Terminal | MarketScanner Pros',
  description:
    'Professional options trading terminal with chains, Greeks, and advanced strategy analysis.',
};

export default function OptionsTerminalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
