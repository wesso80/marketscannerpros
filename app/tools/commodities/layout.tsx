import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Commodities Dashboard | MarketScanner Pros',
  description:
    'Track real-time commodity prices across energy, metals, and agriculture with technical analysis overlays.',
};

export default function CommoditiesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
