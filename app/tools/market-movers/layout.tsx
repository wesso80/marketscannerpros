import type { Metadata } from 'next';

export const metadata: Metadata = {
  alternates: { canonical: 'https://marketscannerpros.app/tools/explorer?tab=movers' },
  title: 'Market Movers | MarketScanner Pros',
  description:
    'Surface the strongest gainers, losers, and most active movers with momentum context, volume confirmation, and scanner-ready ranking.',
  robots: { index: false, follow: false },
};

export default function MarketMoversLayout({ children }: { children: React.ReactNode }) {
  return children;
}
