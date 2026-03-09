import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Company Overview | MarketScanner Pros',
  description:
    'Fundamental analysis and company overview with key financials, valuation metrics, and earnings data.',
};

export default function CompanyOverviewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
