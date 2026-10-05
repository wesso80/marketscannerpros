import type { Metadata } from 'next';
import { sharePreviewMetadata } from '@/lib/og/linkPreview';

export const metadata: Metadata = {
  ...sharePreviewMetadata('overview'),
  title: 'Overview',
};

export default function OverviewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
