import type { Metadata } from 'next';
import { Suspense } from 'react';
import V2Shell from './_components/V2Shell';

export const metadata: Metadata = {
  title: 'MSP v2 — Trading Intelligence Platform',
  description: 'Unified decision workflow: Discover → Validate → Execute → Manage → Review',
};

export default function V2Layout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0A101C] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    }>
      <V2Shell>{children}</V2Shell>
    </Suspense>
  );
}
