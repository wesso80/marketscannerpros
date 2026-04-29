import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Intraday Charts | MarketScanner Pros',
  description:
    'Professional intraday candlestick charts with technical indicators including EMA, SMA, VWAP, and Bollinger Bands.',
  robots: { index: false, follow: true },
  alternates: { canonical: 'https://marketscannerpros.app/tools/golden-egg' },
};

export default function IntradayChartsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
