import type { Metadata } from 'next';
import { sharePreviewMetadata } from '@/lib/og/linkPreview';

export const metadata: Metadata = sharePreviewMetadata('today');

export default function TodayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
