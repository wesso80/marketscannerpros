'use client';

import { Suspense } from 'react';
import JournalPage from '@/components/journal/JournalPage';
import { useUserTier, canAccessJournal } from '@/lib/useUserTier';
import UpgradeGate from '@/components/UpgradeGate';

export default function Page() {
  const { tier, isLoading } = useUserTier();
  if (isLoading) return <div className="min-h-screen bg-[var(--msp-bg)]" />;
  if (!canAccessJournal(tier)) return <UpgradeGate requiredTier="pro" feature="Trade Journal" />;
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--msp-bg)]" />}>
      <JournalPage tier={tier} />
    </Suspense>
  );
}
