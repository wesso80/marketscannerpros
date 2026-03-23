import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Tools | MarketScanner Pros',
  description:
    'AI-powered analytical tools including market analysis, scenario modelling, and data-driven insights.',
};

export default function AIToolsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
