import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Options Confluence Scanner',
  description:
    'Educational strike and expiry context powered by options confluence and multi-timeframe alignment scoring.',
};

export default function OptionsConfluenceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
