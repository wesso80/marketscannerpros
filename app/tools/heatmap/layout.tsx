import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sector Heatmap | MarketScanner Pros',
  description:
    'Visualise sector rotation and market-cap weighted performance across S&P 500 sectors.',
  robots: { index: false, follow: true },
  alternates: { canonical: 'https://marketscannerpros.app/tools/explorer?tab=heatmap' },
};

export default function HeatmapLayout({ children }: { children: React.ReactNode }) {
  return children;
}
