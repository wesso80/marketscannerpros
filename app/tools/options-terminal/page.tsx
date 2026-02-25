'use client';

import React, { Suspense } from 'react';
import { useUserTier, canAccessOptionsTerminal } from '@/lib/useUserTier';
import UpgradeGate from '@/components/UpgradeGate';
import OptionsTerminalView from '@/components/options-terminal/OptionsTerminalView';

function OptionsTerminalInner() {
  const { tier, isLoading } = useUserTier();

  if (isLoading) {
    return <div className="min-h-screen" style={{ background: 'var(--msp-bg)' }} />;
  }

  if (!canAccessOptionsTerminal(tier)) {
    return <UpgradeGate requiredTier="pro_trader" feature="Options Terminal" />;
  }

  return <OptionsTerminalView />;
}

export default function OptionsTerminalPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: 'var(--msp-bg)' }} />}>
      <OptionsTerminalInner />
    </Suspense>
  );
}
