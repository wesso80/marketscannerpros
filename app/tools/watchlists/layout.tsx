import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Watchlists',
  description:
    'Watchlists now live inside Workspace for saved research, alerts, journal notes, and workflow organization.',
  openGraph: {
    title: 'Workspace Watchlists | MarketScannerPros',
    description:
      'Organize symbols inside the MarketScannerPros Workspace workflow.',
    url: 'https://marketscannerpros.app/tools/workspace?tab=watchlists',
    siteName: 'MarketScannerPros',
    images: [{ url: '/scan-banner.png', width: 1200, height: 630, alt: 'MarketScannerPros — Watchlists' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Workspace Watchlists | MarketScannerPros',
    description:
      'Organize symbols inside the MarketScannerPros Workspace workflow.',
    images: ['/scan-banner.png'],
  },
  alternates: {
    canonical: 'https://marketscannerpros.app/tools/workspace?tab=watchlists',
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function WatchlistsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
