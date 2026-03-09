import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Options Scanner | MarketScanner Pros',
  description:
    'Scan options flow and unusual activity with real-time data and institutional-grade analytics.',
};

export default function OptionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
