import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Options Confluence Scanner',
  description:
    'Educational strike and expiry context powered by options confluence and multi-timeframe alignment scoring.',
  robots: { index: false, follow: false },
};

export default function OptionsConfluenceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
