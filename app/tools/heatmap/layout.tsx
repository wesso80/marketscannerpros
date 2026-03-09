import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sector Heatmap | MarketScanner Pros',
  description:
    'Visualise sector rotation and market-cap weighted performance across S&P 500 sectors.',
};

export default function HeatmapLayout({ children }: { children: React.ReactNode }) {
  return children;
}
