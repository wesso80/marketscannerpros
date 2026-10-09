import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Dashboard with My Pages and Macro. Overview is the market home.',
  robots: { index: false, follow: false },
  openGraph: {
    title: 'Dashboard | MarketScannerPros',
    description: 'Dashboard with My Pages and Macro. Overview is the market home.',
    url: 'https://marketscannerpros.app/tools/dashboard',
    type: 'website',
    images: [
      {
        url: '/scan-banner.png',
        width: 1200,
        height: 630,
        alt: 'MarketScanner Pros — Dashboard',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Dashboard | MarketScannerPros',
    description: 'Dashboard with My Pages and Macro. Overview is the market home.',
    images: ['/scan-banner.png'],
  },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
