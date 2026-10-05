import type { Metadata } from 'next';
import { symbolShareMetadata } from '@/lib/og/linkPreview';

export const metadata: Metadata = {
  ...symbolShareMetadata(null),
  title: "Symbol",
};

export default function GoldenEggLayout({ children }: { children: React.ReactNode }) {
  return children;
}
