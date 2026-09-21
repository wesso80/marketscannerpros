import type { Metadata } from 'next';

export const metadata: Metadata = {
  alternates: { canonical: 'https://marketscannerpros.app/tools/golden-egg' },
  title: 'Intraday Charts | MarketScanner Pros',
  description:
    'Professional intraday candlestick charts with technical indicators including EMA, SMA, VWAP, and Bollinger Bands.',
  robots: { index: false, follow: false },
};

export default function IntradayChartsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
