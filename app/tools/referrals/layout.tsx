import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Referrals',
  description: 'Referral dashboard for sharing MarketScanner Pros and tracking subscription credits, contest entries, and referral history.',
  alternates: { canonical: 'https://marketscannerpros.app/tools/referrals' },
  openGraph: {
    title: 'Referrals | MarketScanner Pros',
    description: 'Share MarketScanner Pros and track referral credits and contest entries.',
    url: 'https://marketscannerpros.app/tools/referrals',
    type: 'website',
    images: [{ url: '/scan-banner.png', width: 1200, height: 630, alt: 'MarketScanner Pros — Referrals' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Referrals | MarketScanner Pros',
    description: 'Share MarketScanner Pros and track referral credits.',
    images: ['/scan-banner.png'],
  },
};

export default function ReferralsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
