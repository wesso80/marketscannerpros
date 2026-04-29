import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Economic Calendar | MarketScanner Pros',
  description:
    'Track high-impact economic events, central bank decisions, and macro releases with real-time market context.',
  robots: { index: false, follow: true },
  alternates: { canonical: 'https://marketscannerpros.app/tools/research?tab=calendar' },
};

export default function EconomicCalendarLayout({ children }: { children: React.ReactNode }) {
  return children;
}
