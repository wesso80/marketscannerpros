'use client';

import React, { Suspense } from 'react';
import { useUserTier, canAccessOptionsTerminal } from '@/lib/useUserTier';
import UpgradeGate from '@/components/UpgradeGate';
import CryptoTerminalView from '@/components/crypto-terminal/CryptoTerminalView';

function CryptoTerminalInner() {
  const { tier, isLoading } = useUserTier();

  if (isLoading) {
    return <div className="min-h-screen" style={{ background: 'var(--msp-bg)' }} />;
  }

  if (!canAccessOptionsTerminal(tier)) {
    return <UpgradeGate requiredTier="pro_trader" feature="Crypto Derivatives Terminal" />;
  }

  return <CryptoTerminalView />;
}

export default function CryptoTerminalPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: 'var(--msp-bg)' }} />}>
      <CryptoTerminalInner />
    </Suspense>
  );
}
