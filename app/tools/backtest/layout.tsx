import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Strategy Backtester',
  description:
    'Educational strategy backtesting with historical data, multi-timeframe testing, equity curves, assumptions, and performance metrics.',
  openGraph: {
    title: 'Strategy Backtester | MarketScanner Pros',
    description:
      'Backtest 25+ elite trading strategies with real market data. Multi-timeframe testing, equity curves, AI analysis, and full performance metrics.',
    url: 'https://marketscannerpros.app/tools/backtest',
    siteName: 'MarketScanner Pros',
    images: [{ url: '/scan-banner.png', width: 1200, height: 630, alt: 'MarketScanner Pros — Strategy Backtester' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Strategy Backtester | MarketScanner Pros',
    description:
      'Educational strategy backtesting with assumptions, equity curves, and performance metrics.',
    images: ['/scan-banner.png'],
  },
  alternates: {
    canonical: 'https://marketscannerpros.app/tools/backtest',
  },
};

export default function BacktestLayout({ children }: { children: React.ReactNode }) {
  return children;
}
