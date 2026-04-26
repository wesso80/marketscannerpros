'use client';

import OptionsScannerPage from '@/components/options/OptionsScannerPage';
import { useUserTier, canAccessOptionsTerminal } from '@/lib/useUserTier';
import UpgradeGate from '@/components/UpgradeGate';
import ComplianceDisclaimer from '@/components/ComplianceDisclaimer';

export default function Page() {
  const { tier, isLoading } = useUserTier();
  if (isLoading) return <div className="min-h-screen bg-[var(--msp-bg)]" />;
  if (!canAccessOptionsTerminal(tier)) return <UpgradeGate requiredTier="pro_trader" feature="Options Scanner" />;
  return (
    <div className="min-h-screen bg-[var(--msp-bg)]">
      <div className="px-4 pt-4">
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-100">
          Options scanner outputs are educational research observations only. Options can expire worthless and involve substantial risk. Nothing here is options advice or a recommendation to buy, sell, or write contracts.
        </div>
        <ComplianceDisclaimer compact variant="options" />
      </div>
      <OptionsScannerPage />
    </div>
  );
}
