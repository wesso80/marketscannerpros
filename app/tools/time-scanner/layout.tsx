import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Time Scanner | Trading Tools | MarketScanner Pros',
  description:
    'Advanced Time Gravity Analysis — track decompression windows, midpoint debt, and multi-timeframe confluence zones with institutional-grade precision.',
};

export default function TimeScannerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
