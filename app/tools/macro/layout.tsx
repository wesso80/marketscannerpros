import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Macro Dashboard | MarketScanner Pros',
  description:
    'Comprehensive macro economic dashboard showing indices, rates, commodities, crypto, forex, and volatility in real-time.',
};

export default function MacroLayout({ children }: { children: React.ReactNode }) {
  return children;
}
