import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Crypto Derivatives',
  description:
    'Monitor crypto market structure, derivatives context, and momentum readings in one actionable dashboard.',
  robots: { index: false, follow: false },
  alternates: { canonical: 'https://marketscannerpros.app/tools/crypto-dashboard' },
};

export default function CryptoDashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
