import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Time Confluence Scanner',
  description:
    'Educational multi-timeframe time confluence scanner for reviewing aligned timing windows and temporal market context.',
  robots: { index: false, follow: true },
  alternates: { canonical: 'https://marketscannerpros.app/tools/terminal?tab=time-confluence' },
};

export default function ConfluenceScannerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
