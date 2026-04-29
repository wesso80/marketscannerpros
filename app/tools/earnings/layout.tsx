import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Earnings | Research',
  description:
    'Legacy earnings route. Earnings now live inside Market Intelligence for catalyst and event research.',
  robots: { index: false, follow: true },
  alternates: { canonical: 'https://marketscannerpros.app/tools/research?tab=earnings' },
};

export default function EarningsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
