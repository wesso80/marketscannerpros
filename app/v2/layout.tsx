import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MSP v2 — Trading Intelligence Platform',
  description: 'Unified decision workflow: Discover → Validate → Execute → Manage → Review',
};

export default function V2Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
