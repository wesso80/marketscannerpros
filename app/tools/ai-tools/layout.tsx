import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Tools | MarketScanner Pros',
  description:
    'AI-powered trading tools including market analysis, scenario modelling, and actionable insights.',
};

export default function AIToolsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
