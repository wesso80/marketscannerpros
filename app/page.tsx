import type { Metadata } from 'next';
import CommandHub from '@/components/home/CommandHub';

export const metadata: Metadata = {
  title: 'Market Scanner for Stocks, Crypto & Options | MarketScanner Pros',
  description:
    'Scan equities, crypto, and options flow with multi-timeframe confluence, AI research context, volatility analysis, and a structured research workflow. Educational use only — no financial advice.',
  alternates: { canonical: 'https://marketscannerpros.app/' },
  openGraph: {
    title: 'Market Scanner for Stocks, Crypto & Options | MarketScanner Pros',
    description:
      'Scan equities, crypto, and options flow with multi-timeframe confluence, AI research context, and a structured 5-step research workflow.',
    url: 'https://marketscannerpros.app/',
  },
};

export default function HomePage() {
  return <CommandHub />;
}
