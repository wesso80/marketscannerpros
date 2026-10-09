import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Close timing',
  description:
    'Track crypto market cycles from 1-365 days. Compare volatility expansion windows with close timing analysis.',
  robots: { index: false, follow: true },
  alternates: { canonical: 'https://marketscannerpros.app/tools/terminal?tab=time-confluence' },
};

export default function CryptoTimeConfluenceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
