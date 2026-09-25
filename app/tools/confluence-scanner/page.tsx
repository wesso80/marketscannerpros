'use client';

import { Suspense } from 'react';
import TimeScannerPage from '@/components/time/TimeScannerPage';
import { useUserTier, canAccessConfluenceScanner } from '@/lib/useUserTier';
import UpgradeGate from '@/components/UpgradeGate';

function LoadingSpinner({ embeddedInTerminal = false }: { embeddedInTerminal?: boolean }) {
  return (
    <div className={`${embeddedInTerminal ? 'min-h-[12rem]' : 'min-h-screen'} bg-[var(--msp-bg)] flex items-center justify-center`}>
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--msp-accent)] border-t-transparent" />
    </div>
  );
}

export default function Page({ embeddedInTerminal = false, symbol, assetType, timeframe }: { embeddedInTerminal?: boolean; symbol?: string; assetType?: 'equity' | 'crypto'; timeframe?: string } = {}) {
  const { tier, isLoading } = useUserTier();
  if (isLoading) return <LoadingSpinner embeddedInTerminal={embeddedInTerminal} />;
  if (!canAccessConfluenceScanner(tier)) return <UpgradeGate requiredTier="pro" feature="Time Confluence Scanner" />;
  return (
    <Suspense fallback={<LoadingSpinner embeddedInTerminal={embeddedInTerminal} />}>
      <TimeScannerPage symbol={symbol} assetType={assetType} timeframe={timeframe} embeddedInTerminal={embeddedInTerminal} />
    </Suspense>
  );
}
