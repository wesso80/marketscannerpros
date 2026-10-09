import type { Metadata } from 'next';
import { publicDesignEnabled } from '@/lib/publicDesign';
import ResearchHome from '@/components/public-design/ResearchHome';
import CommandHub from '@/components/home/CommandHub';

export const metadata: Metadata = publicDesignEnabled() ? {
  title: { absolute: 'Evidence-first market research | MarketScannerPros' },
  description: 'Explore symbol research, macro context and your own records. Understand observations, sources and limitations before drawing conclusions.',
  alternates: { canonical: 'https://marketscannerpros.app/' },
  openGraph: {
    title: 'Evidence-first market research | MarketScannerPros',
    description: 'See the market. Understand the evidence.',
    url: 'https://marketscannerpros.app/',
  },
} : {
  title: { absolute: 'Market Scanner for Stocks, Crypto & Options | MarketScannerPros' },
  description:
    'Scan equities, crypto, and options flow with multi-timeframe charts, AI research context, volatility analysis, and a structured research workflow. Educational use only â€” no financial advice.',
  alternates: { canonical: 'https://marketscannerpros.app/' },
  openGraph: {
    title: 'Market Scanner for Stocks, Crypto & Options | MarketScannerPros',
    description:
      'Scan equities, crypto, and options flow with multi-timeframe charts, AI research context, and a structured research workflow.',
    url: 'https://marketscannerpros.app/',
  },
};

export default function HomePage() {
  return publicDesignEnabled() ? <ResearchHome /> : <CommandHub />;
}
