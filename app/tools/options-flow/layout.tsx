import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Options Flow | MarketScanner Pros',
  description: 'Educational options premium flow and IV skew context.',
  robots: { index: false, follow: true },
  alternates: { canonical: 'https://marketscannerpros.app/tools/terminal?tab=options-flow' },
};

export default function OptionsFlowLayout({ children }: { children: React.ReactNode }) {
  return children;
}
