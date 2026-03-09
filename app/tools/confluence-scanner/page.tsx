'use client';

import { Suspense } from 'react';
import TimeScannerPage from '@/components/time/TimeScannerPage';
import { useUserTier, canAccessConfluenceScanner } from '@/lib/useUserTier';
import UpgradeGate from '@/components/UpgradeGate';

function LoadingSpinner() {
  return (
    <div className="min-h-screen bg-[var(--msp-bg)] flex items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--msp-accent)] border-t-transparent" />
    </div>
  );
}

export default function Page() {
  const { tier, isLoading } = useUserTier();
  if (isLoading) return <LoadingSpinner />;
  if (!canAccessConfluenceScanner(tier)) return <UpgradeGate requiredTier="pro_trader" feature="Time Confluence Scanner" />;
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <TimeScannerPage />
    </Suspense>
  );
}
