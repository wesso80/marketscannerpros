import type { Metadata } from 'next';
import { sharePreviewMetadata } from '@/lib/og/linkPreview';

export const metadata: Metadata = {
  ...sharePreviewMetadata('radar'),
  title: "Daily Radar",
};

export default function MspRadarLayout({ children }: { children: React.ReactNode }) {
  return children;
}
