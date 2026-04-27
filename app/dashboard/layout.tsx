import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'MarketScanner Pros dashboard redirect to the educational trading command center.',
  alternates: { canonical: '/tools/dashboard' },
  robots: { index: false, follow: true },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
