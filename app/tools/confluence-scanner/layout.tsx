import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Time Confluence Scanner | Trading Tools | MarketScanner Pros',
  description:
    'Multi-timeframe time confluence scanner for identifying high-probability trading windows where multiple temporal cycles align.',
};

export default function ConfluenceScannerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
