import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MSP AI',
  description:
    'AI Analyst is available as the MSP AI panel across the platform. This legacy page redirects to Scanner for live research context.',
  alternates: { canonical: 'https://marketscannerpros.app/tools/scanner' },
  robots: { index: false, follow: true },
};

export default function AIAnalystLayout({ children }: { children: React.ReactNode }) {
  return children;
}
