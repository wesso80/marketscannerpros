import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ARCA',
  description:
    'Legacy AI tools collection route. Current AI research support is available through the workflow and floating ARCA panel.',
  alternates: { canonical: 'https://marketscannerpros.app/tools' },
  robots: { index: false, follow: true },
};

export default function AIToolsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
