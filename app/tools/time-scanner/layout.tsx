import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Time Scanner',
  description:
    'Educational time scanner for reviewing decompression windows, midpoint debt, and multi-timeframe confluence zones.',
};

export default function TimeScannerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
