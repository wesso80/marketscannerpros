import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Market Explorer',
  description: 'Sector heatmaps, market movers, commodities, and cross-market analysis.',
};

export default function ExplorerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
