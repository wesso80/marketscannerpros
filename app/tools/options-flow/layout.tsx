import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Options Flow | MarketScanner Pros',
  description: 'Educational options premium flow and IV skew context.',
  robots: { index: false, follow: false },
};

export default function OptionsFlowLayout({ children }: { children: React.ReactNode }) {
  return children;
}
