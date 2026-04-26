'use client';

import React, { Suspense } from 'react';
import { useUserTier, canAccessOptionsTerminal } from '@/lib/useUserTier';
import UpgradeGate from '@/components/UpgradeGate';
import ComplianceDisclaimer from '@/components/ComplianceDisclaimer';
import OptionsTerminalView from '@/components/options-terminal/OptionsTerminalView';

function OptionsTerminalInner() {
  const { tier, isLoading } = useUserTier();

  if (isLoading) {
    return <div className="min-h-screen" style={{ background: 'var(--msp-bg)' }} />;
  }

  if (!canAccessOptionsTerminal(tier)) {
    return <UpgradeGate requiredTier="pro_trader" feature="Options Terminal" />;
  }

  return (
    <div className="min-h-screen bg-[var(--msp-bg)]">
      <div className="px-4 pt-4">
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-100">
          Options involve substantial risk and can expire worthless. This terminal displays educational scenarios and market data only — not options advice, broker execution, or a recommendation to buy or sell contracts.
        </div>
        <ComplianceDisclaimer compact />
      </div>
      <OptionsTerminalView />
    </div>
  );
}

export default function OptionsTerminalPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: 'var(--msp-bg)' }} />}>
      <OptionsTerminalInner />
    </Suspense>
  );
}
