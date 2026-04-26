'use client';

import CryptoTimeConfluenceWidget from '@/components/CryptoTimeConfluenceWidget';
import { useUserTier, canAccessTimeScanner } from '@/lib/useUserTier';
import { UpgradeGate } from '@/app/v2/_components/ui';

export default function CryptoTimeConfluenceInner() {
  const { tier, isLoading } = useUserTier();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--msp-bg)] flex items-center justify-center">
        <div className="text-slate-500 text-sm">Loading…</div>
      </div>
    );
  }

  if (!canAccessTimeScanner(tier)) {
    return (
      <div className="min-h-screen bg-[var(--msp-bg)] flex items-center justify-center">
        <UpgradeGate requiredTier="pro_trader" currentTier={tier} feature="Crypto Time Confluence"><div /></UpgradeGate>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--msp-bg)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <div className="mx-auto mb-4 h-16 w-16 overflow-hidden rounded-lg">
            <img src="/assets/scanners/time-confluence.png" alt="Time Confluence" className="h-full w-full object-contain p-1" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">Crypto Time Confluence Engine</h1>
          <p className="text-lg text-slate-400 max-w-3xl mx-auto">
            Track crypto market cycles from 1 to 365 days, all anchored to the UTC daily close.
            Detect when multiple important time cycles align for technically aligned setups.
          </p>
        </div>
        <div className="max-w-2xl mx-auto mb-12">
          <CryptoTimeConfluenceWidget />
        </div>
      </div>
    </div>
  );
}
