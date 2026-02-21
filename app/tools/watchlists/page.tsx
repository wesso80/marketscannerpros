'use client';

import { Suspense, useEffect } from 'react';
import WatchlistWidget from '@/components/WatchlistWidget';
import { useAIPageContext } from '@/lib/ai/pageContext';

function WatchlistsContent() {
  const { setPageData } = useAIPageContext();

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

  return (
    <div className="min-h-screen">
      <main className="pt-6 pb-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="mb-2 text-3xl font-bold text-white">Institutional Watchlist Engine</h1>
            <p className="text-slate-400">Monitor and organize symbols for tactical scanning with live market data (educational mode)</p>
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
