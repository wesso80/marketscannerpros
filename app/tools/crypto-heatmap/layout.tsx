import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Crypto Heatmap | MarketScanner Pros',
  description:
    'View real-time crypto sector strength and rotation with a market-cap weighted heatmap powered by CoinGecko data.',
};

export default function CryptoHeatmapLayout({ children }: { children: React.ReactNode }) {
  return children;
}
