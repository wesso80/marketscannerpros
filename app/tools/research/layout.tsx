import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Research',
  description: 'Market news, economic calendar, and earnings reports.',
};

export default function ResearchLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
