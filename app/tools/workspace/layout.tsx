import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Track',
  description: 'Command workspace for watchlists, journal notes, portfolio research, alerts, and educational workflow organization.',
  robots: { index: false, follow: false },
  openGraph: {
    title: 'Workspace | MarketScannerPros',
    description: 'Organize watchlists, journal notes, portfolio research, alerts, and workflow context.',
    url: 'https://marketscannerpros.app/tools/workspace',
    type: 'website',
    images: [{ url: '/scan-banner.png', width: 1200, height: 630, alt: 'MarketScannerPros — Workspace' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Workspace | MarketScannerPros',
    description: 'Command workspace for educational market research workflows.',
    images: ['/scan-banner.png'],
  },
};

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
