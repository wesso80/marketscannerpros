import Link from 'next/link';
import { TradeModel } from '@/types/journal';

export default function TradeSnapshotsTab({ trade }: { trade?: TradeModel }) {
  if (!trade) return <div className="text-sm text-slate-400">No trade selected.</div>;

  return (
    <div className="space-y-3 text-sm text-slate-200">
      <div className="rounded-xl border border-white/10 bg-white/5 p-3">Snapshots auto-attach at entry/exit as snapshot plumbing is enabled.</div>
      <div className="flex flex-wrap gap-2">
        <Link href={`/tools/scanner?symbol=${encodeURIComponent(trade.symbol)}`} className="rounded bg-white/10 px-3 py-1.5 text-xs">Scanner Snapshot Context</Link>
        <Link href={`/tools/options?symbol=${encodeURIComponent(trade.symbol)}`} className="rounded bg-white/10 px-3 py-1.5 text-xs">Options Snapshot Context</Link>
        <Link href={`/tools/time?symbol=${encodeURIComponent(trade.symbol)}`} className="rounded bg-white/10 px-3 py-1.5 text-xs">Time Snapshot Context</Link>
      </div>
    </div>
  );
}
