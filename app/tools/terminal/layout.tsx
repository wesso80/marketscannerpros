import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terminal',
  description: 'Educational terminal for equity, crypto, and futures timing workflows including close-calendar context, session maps, flow, and time-confluence review.',
  alternates: { canonical: 'https://marketscannerpros.app/tools/terminal' },
  openGraph: {
    title: 'Terminal | MarketScanner Pros',
    description: 'Educational terminal for equity, crypto, and futures market-structure timing workflows.',
    url: 'https://marketscannerpros.app/tools/terminal',
    type: 'website',
    images: [{ url: '/scan-banner.png', width: 1200, height: 630, alt: 'MarketScanner Pros — Terminal' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Terminal | MarketScanner Pros',
    description: 'Educational terminal for equity, crypto, and futures timing research.',
    images: ['/scan-banner.png'],
  },
};

export default function TerminalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
