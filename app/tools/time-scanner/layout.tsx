import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Time Scanner',
  description:
    'Educational time scanner for reviewing decompression windows, midpoint debt, and multi-timeframe confluence zones.',
  robots: { index: false, follow: true },
  alternates: { canonical: 'https://marketscannerpros.app/tools/terminal?tab=time-scanner' },
};

export default function TimeScannerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
