import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Crypto Intelligence' };

export default function CryptoIntelLayout({ children }: { children: React.ReactNode }) {
  return children;
}
