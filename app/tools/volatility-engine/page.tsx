'use client';

import VolatilityEnginePage from '@/src/features/volatilityEngine/VolatilityEnginePage';
import { useUserTier, canAccessVolatilityEngine } from '@/lib/useUserTier';
import UpgradeGate from '@/components/UpgradeGate';

export default function Page() {
  const { tier, isLoading } = useUserTier();
  if (isLoading) return <div className="min-h-screen bg-[var(--msp-bg)]" />;
  if (!canAccessVolatilityEngine(tier)) {
    return <UpgradeGate requiredTier="pro_trader" feature="Directional Volatility Engine" />;
  }
  return <VolatilityEnginePage />;
}
