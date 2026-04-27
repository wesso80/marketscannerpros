import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Time Confluence Scanner',
  description:
    'Educational multi-timeframe time confluence scanner for reviewing aligned timing windows and temporal market context.',
};

export default function ConfluenceScannerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
