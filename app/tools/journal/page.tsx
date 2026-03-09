'use client';

import { Suspense } from 'react';
import JournalPage from '@/components/journal/JournalPage';
import { useUserTier, canAccessJournal } from '@/lib/useUserTier';
import UpgradeGate from '@/components/UpgradeGate';

export default function Page() {
  const { tier, isLoading } = useUserTier();
  if (isLoading) return (
    <div className="min-h-screen bg-[var(--msp-bg)] flex items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
    </div>
  );
  if (!canAccessJournal(tier)) return <UpgradeGate requiredTier="pro" feature="Trade Journal" />;
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[var(--msp-bg)] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    }>
      <JournalPage tier={tier} />
    </Suspense>
  );
}
