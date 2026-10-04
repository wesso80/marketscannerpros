import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Scalper' };

export default function ScalperLayout({ children }: { children: React.ReactNode }) {
  return children;
}
