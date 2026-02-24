'use client';

import JournalPage from '@/components/journal/JournalPage';
import { useUserTier, canAccessBacktest } from '@/lib/useUserTier';
import UpgradeGate from '@/components/UpgradeGate';

export default function Page() {
  const { tier, isLoading } = useUserTier();
  if (isLoading) return <div className="min-h-screen bg-[var(--msp-bg)]" />;
  if (!canAccessBacktest(tier)) return <UpgradeGate requiredTier="pro_trader" feature="Trade Journal" />;
  return <JournalPage />;
}
