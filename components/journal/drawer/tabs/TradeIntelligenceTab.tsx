'use client';

import { useState } from 'react';
import { TradeModel } from '@/types/journal';

export default function TradeIntelligenceTab({ trade }: { trade?: TradeModel }) {
  const [reviewText, setReviewText] = useState('');
  if (!trade) return <div className="text-sm text-slate-400">Select a trade to review intelligence.</div>;
  return (
    <div className="space-y-3 text-sm text-slate-200">
      <div className="rounded-xl border border-white/10 bg-white/5 p-3">Outcome / Setup Quality / Followed Plan / Error Type are captured in close flow.</div>
      <textarea
        value={reviewText}
        onChange={(event) => setReviewText(event.target.value)}
        placeholder="Post-trade review notes"
        className="min-h-24 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100"
      />
    </div>
  );
}
