import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Crypto Time Confluence | MarketScanner Pros',
  description:
    'Track crypto market cycles from 1-365 days. Detect technically aligned volatility expansion windows with professional-level time confluence analysis.',
  robots: { index: false, follow: true },
  alternates: { canonical: 'https://marketscannerpros.app/tools/terminal?tab=time-confluence' },
};

export default function CryptoTimeConfluenceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
