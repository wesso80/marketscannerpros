import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Confirming Checkout',
  description: 'Secure checkout confirmation for MarketScanner Pros subscriptions.',
  alternates: { canonical: '/after-checkout' },
  robots: { index: false, follow: false },
};

export default function AfterCheckoutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
