import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Earnings Calendar | Research',
  description:
    'Legacy earnings calendar route. Earnings calendar now lives inside Market Intelligence.',
  alternates: { canonical: 'https://marketscannerpros.app/tools/research?tab=earnings' },
  robots: { index: false, follow: true },
};

export default function EarningsCalendarLayout({ children }: { children: React.ReactNode }) {
  return children;
}
