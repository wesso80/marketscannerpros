import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Time Scanner',
  description:
    'Educational time scanner for reviewing decompression windows, midpoint debt, and multi-timeframe agreement zones.',
  robots: { index: false, follow: false },
};

export default function TimeScannerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
