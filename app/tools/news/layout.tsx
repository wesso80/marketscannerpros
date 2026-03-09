import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Market News Scanner | MarketScanner Pros',
  description:
    'Track market-moving news with scanner context and actionable signal overlays for faster trade decisions.',
};

export default function NewsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
