import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Trade Terminal',
  description: 'Educational terminal for close-calendar context, options research, crypto derivatives, flow, and time-confluence review.',
  alternates: { canonical: 'https://marketscannerpros.app/tools/terminal' },
  openGraph: {
    title: 'Trade Terminal | MarketScanner Pros',
    description: 'Educational terminal for close-calendar, options, crypto derivatives, flow, and time-confluence research.',
    url: 'https://marketscannerpros.app/tools/terminal',
    type: 'website',
    images: [{ url: '/scan-banner.png', width: 1200, height: 630, alt: 'MarketScanner Pros — Trade Terminal' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Trade Terminal | MarketScanner Pros',
    description: 'Educational terminal for options, crypto derivatives, flow, and timing research.',
    images: ['/scan-banner.png'],
  },
};

export default function TerminalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
