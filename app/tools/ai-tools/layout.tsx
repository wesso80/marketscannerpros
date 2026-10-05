import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MSP AI',
  description:
    'Legacy AI tools collection route. Current AI research support is available through the workflow and floating MSP AI panel.',
  alternates: { canonical: 'https://marketscannerpros.app/tools' },
  robots: { index: false, follow: true },
};

export default function AIToolsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
