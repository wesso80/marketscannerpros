import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Strategy Backtester | Trading Tools | MarketScanner Pros',
  description:
    'Backtest 25+ elite trading strategies with real market data. Multi-timeframe testing, equity curves, AI analysis, and full performance metrics.',
  openGraph: {
    title: 'Strategy Backtester | MarketScanner Pros',
    description:
      'Backtest 25+ elite trading strategies with real market data. Multi-timeframe testing, equity curves, AI analysis, and full performance metrics.',
    url: 'https://app.marketscannerpros.app/tools/backtest',
    siteName: 'MarketScanner Pros',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Strategy Backtester | MarketScanner Pros',
    description:
      'Backtest 25+ elite trading strategies with real market data. Multi-timeframe testing, equity curves, and AI analysis.',
  },
  alternates: {
    canonical: 'https://app.marketscannerpros.app/tools/backtest',
  },
};

export default function BacktestLayout({ children }: { children: React.ReactNode }) {
  return children;
}
