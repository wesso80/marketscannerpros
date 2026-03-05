'use client';

import GoldenEggPage from '@/src/features/goldenEgg/GoldenEggPage';
import { useUserTier, canAccessGoldenEgg } from '@/lib/useUserTier';
import UpgradeGate from '@/components/UpgradeGate';

export default function Page() {
  const { tier, isLoading } = useUserTier();
  if (isLoading) return <div className="min-h-screen bg-[var(--msp-bg)]" />;
  if (!canAccessGoldenEgg(tier)) return <UpgradeGate requiredTier="pro_trader" feature="Golden Egg Analysis" />;
  return <GoldenEggPage />;
}
