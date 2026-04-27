import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Account Settings',
  description: 'Manage your MarketScanner Pros subscription, alert preferences, billing, and account data controls.',
  alternates: { canonical: '/account' },
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
