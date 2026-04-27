import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Command Center dashboard with market regime, scanner highlights, movers, macro events, news, and educational workflow context.',
  alternates: { canonical: 'https://marketscannerpros.app/tools/dashboard' },
  openGraph: {
    title: 'Dashboard | MarketScanner Pros',
    description: 'Command Center dashboard with market regime, scanner highlights, movers, macro events, and news context.',
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
    title: 'Dashboard | MarketScanner Pros',
    description: 'Command Center dashboard for educational market research workflows.',
    images: ['/scan-banner.png'],
  },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
