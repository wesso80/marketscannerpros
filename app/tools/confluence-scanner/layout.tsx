import type { Metadata } from 'next';

export const metadata: Metadata = {
  alternates: { canonical: 'https://marketscannerpros.app/tools/terminal?tab=time-confluence' },
  title: 'Close timing',
  description:
    'Educational multi-timeframe close timing scanner for reviewing timing windows and market context.',
  robots: { index: false, follow: false },
};

export default function ConfluenceScannerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
