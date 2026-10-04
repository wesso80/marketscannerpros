import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Options',
  description:
    'Scan options flow and unusual activity with real-time data and professional-level analytics.',
  robots: { index: false, follow: true },
  alternates: { canonical: 'https://marketscannerpros.app/tools/options' },
};

export default function OptionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
