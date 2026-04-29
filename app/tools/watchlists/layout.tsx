import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Watchlists | Workspace',
  description:
    'Watchlists now live inside Workspace for saved research, alerts, journal notes, and workflow organization.',
  openGraph: {
    title: 'Workspace Watchlists | MarketScanner Pros',
    description:
      'Organize symbols inside the MarketScanner Pros Workspace workflow.',
    url: 'https://marketscannerpros.app/tools/workspace?tab=watchlists',
    siteName: 'MarketScanner Pros',
    images: [{ url: '/scan-banner.png', width: 1200, height: 630, alt: 'MarketScanner Pros — Watchlists' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Workspace Watchlists | MarketScanner Pros',
    description:
      'Organize symbols inside the MarketScanner Pros Workspace workflow.',
    images: ['/scan-banner.png'],
  },
  alternates: {
    canonical: 'https://marketscannerpros.app/tools/workspace?tab=watchlists',
  },
  robots: {
    index: false,
    follow: true,
  },
};

export default function WatchlistsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
