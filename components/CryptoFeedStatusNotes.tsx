'use client';

import { useMemo } from 'react';
import { cryptoReviewFeedNotes } from '@/lib/cryptoReviewData';

/**
 * "Feed status" list for the crypto analysis gate (OV-18): one line per feed holding the gate back, naming the
 * provider feed and since when. Shared by the dashboard gate card and Explorer's Crypto Command tab so both show
 * the same list. Renders nothing while loading or when every feed is fresh.
 */
export default function CryptoFeedStatusNotes({ marketData }: { marketData: any }) {
  const feedNotes = useMemo(() => (marketData ? cryptoReviewFeedNotes(marketData) : []), [marketData]);
  if (feedNotes.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5 rounded border border-amber-500/30 bg-amber-500/5 p-1.5 text-[11px] text-amber-200" aria-label="Feed status">
      {feedNotes.map((note) => <li key={note}>{note}</li>)}
    </ul>
  );
}
