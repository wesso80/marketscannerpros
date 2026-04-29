import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Market Movers | MarketScanner Pros',
  description:
    'Surface the strongest gainers, losers, and most active movers with momentum context, volume confirmation, and scanner-ready ranking.',
  robots: { index: false, follow: true },
  alternates: { canonical: 'https://marketscannerpros.app/tools/explorer?tab=movers' },
};

export default function MarketMoversLayout({ children }: { children: React.ReactNode }) {
  return children;
}
