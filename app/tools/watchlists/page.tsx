'use client';

import { Suspense, useEffect } from 'react';
import WatchlistWidget from '@/components/WatchlistWidget';
import { useAIPageContext } from '@/lib/ai/pageContext';
import RegimeBanner from '@/components/RegimeBanner';
import { useUserTier } from '@/lib/useUserTier';
import Link from 'next/link';

function WatchlistsContent() {
  const { setPageData } = useAIPageContext();
  const { tier } = useUserTier();

  useEffect(() => {
    setPageData({
      skill: 'watchlist',
      symbols: [],
      data: {
        pageType: 'watchlists',
      },
      summary: 'Institutional watchlist staging and educational tracking workspace',
    });
  }, [setPageData]);

  if (tier === 'anonymous') {
    return (
      <div className="min-h-screen bg-[var(--msp-bg)]">
        <main className="pt-6 pb-16">
          <div className="mx-auto max-w-none px-4 sm:px-6 lg:px-8">
            <div className="mb-8">
              <h1 className="mb-2 text-3xl font-bold text-white">Institutional Watchlist Engine</h1>
              <p className="text-slate-400">Monitor and organize symbols for tactical scanning with live market data (educational mode)</p>
            </div>
            <div className="mx-auto max-w-md rounded-lg border border-slate-700 bg-slate-900/80 p-8 text-center">
              <div className="mx-auto mb-4 h-10 w-10 rounded-full border border-slate-600 bg-slate-950" aria-hidden="true" />
              <h2 className="mb-2 text-xl font-bold text-white">Sign in to access Watchlists</h2>
              <p className="mb-6 text-sm text-slate-400">Create and manage watchlists by signing in with your MarketScanner Pros account.</p>
              <Link href="/login" className="inline-block rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors">
                Sign In
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--msp-bg)]">
      <main className="pt-6 pb-16">
        <div className="mx-auto max-w-none px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="mb-2 text-3xl font-bold text-white">Institutional Watchlist Engine</h1>
            <p className="text-slate-400">Monitor and organize symbols for tactical scanning with live market data (educational mode)</p>
          </div>

          <div className="mb-4">
            <RegimeBanner />
          </div>

          <WatchlistWidget />
        </div>
      </main>
    </div>
  );
}

export default function WatchlistsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-t-2 border-b-2 border-emerald-500" />
        </div>
      }
    >
      <WatchlistsContent />
    </Suspense>
  );
}
