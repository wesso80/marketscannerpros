import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Market News Scanner | MarketScanner Pros',
  description:
    'Track market-moving news with scanner context and analytical overlays for informed research.',
};

export default function NewsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
