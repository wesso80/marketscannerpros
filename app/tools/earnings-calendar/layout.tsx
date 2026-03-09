import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Earnings Calendar | MarketScanner Pros',
  description:
    'View the full earnings calendar with pre-market and after-hours timing, impact scores, and catalyst analysis.',
};

export default function EarningsCalendarLayout({ children }: { children: React.ReactNode }) {
  return children;
}
