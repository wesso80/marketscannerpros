'use client';

import OptionsScannerPage from '@/components/options/OptionsScannerPage';
import { useUserTier, canAccessOptionsTerminal } from '@/lib/useUserTier';
import UpgradeGate from '@/components/UpgradeGate';

export default function Page() {
  const { tier, isLoading } = useUserTier();
  if (isLoading) return <div className="min-h-screen bg-[var(--msp-bg)]" />;
  if (!canAccessOptionsTerminal(tier)) return <UpgradeGate requiredTier="pro_trader" feature="Options Scanner" />;
  return <OptionsScannerPage />;
}
