import type { Metadata } from 'next';

export const metadata: Metadata = {
  alternates: { canonical: 'https://marketscannerpros.app/tools/workspace?tab=backtest' },
  title: 'Backtest',
  description:
    'Educational strategy backtesting with historical data, multi-timeframe testing, equity curves, assumptions, and performance metrics.',
  openGraph: {
    title: 'Strategy Backtester | MarketScannerPros',
    description:
      'Run educational historical simulations with visible assumptions, multi-timeframe testing, equity curves, AI-assisted review, and performance metrics.',
    url: 'https://marketscannerpros.app/tools/workspace?tab=backtest',
    siteName: 'MarketScannerPros',
    images: [{ url: '/scan-banner.png', width: 1200, height: 630, alt: 'MarketScannerPros — Strategy Backtester' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Strategy Backtester | MarketScannerPros',
    description:
      'Educational strategy backtesting with assumptions, equity curves, and performance metrics.',
    images: ['/scan-banner.png'],
  },
  robots: { index: false, follow: false },
};

export default function BacktestLayout({ children }: { children: React.ReactNode }) {
  return children;
}
