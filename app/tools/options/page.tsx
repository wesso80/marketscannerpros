'use client';

import OptionsScannerPage from '@/components/options/OptionsScannerPage';
import { useUserTier, canAccessPortfolioInsights } from '@/lib/useUserTier';
import UpgradeGate from '@/components/UpgradeGate';

export default function Page() {
  const { tier, isLoading } = useUserTier();
  if (isLoading) return <div className="min-h-screen bg-[var(--msp-bg)]" />;
  if (!canAccessPortfolioInsights(tier)) return <UpgradeGate requiredTier="pro" feature="Options Scanner" />;
  return <OptionsScannerPage />;
}
