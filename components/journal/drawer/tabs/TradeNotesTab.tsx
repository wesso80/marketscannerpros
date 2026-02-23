'use client';

import { useState } from 'react';
import { TradeModel } from '@/types/journal';

export default function TradeNotesTab({ trade }: { trade?: TradeModel }) {
  const [note, setNote] = useState('');
  if (!trade) return <div className="text-sm text-slate-400">No trade selected.</div>;

  return (
    <div className="space-y-3 text-sm text-slate-200">
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Manual note"
        className="min-h-24 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100"
      />
      <button disabled className="rounded bg-white/10 px-3 py-1.5 text-xs text-slate-100 opacity-40 cursor-not-allowed">Add Note (coming soon)</button>
      <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-400">AI notes stream placeholder (collapsed list).</div>
    </div>
  );
}
