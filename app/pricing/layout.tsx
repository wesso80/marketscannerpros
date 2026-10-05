import type { Metadata } from 'next';
import { sharePreviewMetadata } from '@/lib/og/linkPreview';

// Same prices as the page. The description stays under 160 characters.
const description =
  'Free, or Pro at $24.99/month or $249/year. General information only, not financial advice.';

export const metadata: Metadata = sharePreviewMetadata('pricing', description);

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
