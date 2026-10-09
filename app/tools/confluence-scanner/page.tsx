'use client';

import { Suspense } from 'react';
import Link from 'next/link';
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
  if (!canAccessConfluenceScanner(tier)) {
    if (embeddedInTerminal) {
      const label = (symbol || '').trim().toUpperCase();
      return (
        <section aria-label="Close timing" className="rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-6">
          <h2 className="text-base font-semibold text-slate-100">Close timing for {label || 'this symbol'}</h2>
          <p className="mt-2 text-sm text-slate-400">
            {label ? `${label} is already loaded. ` : ''}Close timing is on the Pro plan. Opening this view does not use a free scan.
          </p>
          <Link href="/pricing" className="mt-4 inline-flex min-h-10 items-center rounded-lg border border-slate-700 px-4 text-sm font-semibold text-slate-100">
            Unlock Close timing
          </Link>
        </section>
      );
    }
    return <UpgradeGate requiredTier="pro" feature="Time Confluence Scanner" />;
  }
  return (
    <Suspense fallback={<LoadingSpinner embeddedInTerminal={embeddedInTerminal} />}>
      <TimeScannerPage symbol={symbol} assetType={assetType} timeframe={timeframe} embeddedInTerminal={embeddedInTerminal} />
    </Suspense>
  );
}
