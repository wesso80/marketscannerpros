import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Analyst | MarketScanner Pros',
  description:
    'Get structured AI market analysis, scenario breakdowns, and actionable trading context across your scanner data.',
};

export default function AIAnalystLayout({ children }: { children: React.ReactNode }) {
  return children;
}
