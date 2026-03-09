import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Earnings Scanner | MarketScanner Pros',
  description:
    'Monitor upcoming earnings and risk events with technical context to avoid low-quality entries and time better setups.',
  robots: 'noindex,follow',
  alternates: { canonical: 'https://marketscannerpros.app/tools/news' },
};

export default function EarningsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
