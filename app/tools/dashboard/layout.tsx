import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Research Dashboard | MarketScanner Pros',
  description: 'Research Dashboard: the canonical ranked research queue, movers, macro events, news, and educational workflow context.',
  robots: { index: false, follow: false },
  openGraph: {
    title: 'Research Dashboard | MarketScanner Pros',
    description: 'Research Dashboard with the ranked research queue, movers, macro events, and news context.',
    url: 'https://marketscannerpros.app/tools/dashboard',
    type: 'website',
    images: [
      {
        url: '/scan-banner.png',
        width: 1200,
        height: 630,
        alt: 'MarketScanner Pros — Command Center Dashboard',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Command Center | MarketScanner Pros',
    description: 'Command Center dashboard for educational market research workflows.',
    images: ['/scan-banner.png'],
  },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
